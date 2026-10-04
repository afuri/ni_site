"""Attempts service."""
from datetime import datetime, timedelta, timezone
import math
import json
import time
import re
from types import SimpleNamespace

from app.core.config import settings
from app.core.metrics import (
    ATTEMPTS_STARTED_TOTAL,
    ATTEMPTS_SUBMITTED_TOTAL,
    REDIS_CACHE_HITS_TOTAL,
    REDIS_CACHE_MISSES_TOTAL,
    REDIS_OP_LATENCY_SECONDS,
)
from app.core.redis import safe_redis
from app.core.cache import olympiad_tasks_key, olympiad_meta_key
from app.core.age_groups import class_grades_allow, normalize_age_group
from app.core.olympiad_codes import olympiad_id_from_code
from app.schemas.tasks import TaskCreate
from app.services.audit_events import add_audit_event
from app.models.attempt import Attempt, AttemptStatus, AttemptTaskGrade
from app.models.task import TaskType
from sqlalchemy import select, text
from app.core.errors import http_error
from app.models.user import SchoolStatus, User, UserRole
from app.repos.attempts import AttemptsRepo
from app.repos.users import UsersRepo
from app.repos.olympiad_pools import OlympiadPoolsRepo
from app.repos.olympiad_assignments import OlympiadAssignmentsRepo
from app.repos.olympiads import OlympiadsRepo
from app.services.olympiad_pools import OlympiadPoolsService
from app.core import error_codes as codes


class AttemptsService:
    def __init__(self, repo: AttemptsRepo):
        self.repo = repo

    @staticmethod
    def _now_utc() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _sanitize_task_payload(task_type: TaskType, payload: dict) -> dict:
        image_position = None
        if isinstance(payload, dict):
            image_position = payload.get("image_position")
        image_payload = (
            {"image_position": image_position}
            if image_position in ("before", "after")
            else {}
        )
        if task_type in (TaskType.single_choice, TaskType.multi_choice):
            options = payload.get("options") if isinstance(payload, dict) else None
            safe_options = [
                {"id": option["id"], "text": option["text"]}
                for option in options or []
                if isinstance(option, dict) and isinstance(option.get("id"), str)
                and isinstance(option.get("text"), str)
            ]
            return {**image_payload, "options": safe_options}
        if task_type == TaskType.short_text:
            subtype = payload.get("subtype") if isinstance(payload, dict) else None
            if subtype in ("int", "float", "text"):
                return {**image_payload, "subtype": subtype}
            return image_payload
        return image_payload

    @staticmethod
    def _serialize_task_type(task_type: TaskType):
        return task_type.value if isinstance(task_type, TaskType) else str(task_type)

    @staticmethod
    def _normalize_age_group(age_group) -> str | None:
        if age_group is None:
            return None
        try:
            return normalize_age_group(age_group)
        except ValueError:
            return str(getattr(age_group, "value", age_group))

    @classmethod
    def _age_group_allows(cls, *, class_grade: int | None, age_group) -> bool:
        try:
            return class_grades_allow(age_group, class_grade)
        except ValueError:
            return False

    async def _get_tasks_cached(self, olympiad_id: int) -> list[dict]:
        redis = await safe_redis()
        if redis is None:
            return await self.repo.list_tasks_full(olympiad_id)

        cache_key = olympiad_tasks_key(olympiad_id)
        cached = None
        start = time.perf_counter()
        try:
            cached = await redis.get(cache_key)
        except Exception:
            cached = None
        REDIS_OP_LATENCY_SECONDS.labels(op="get", cache="olympiad_tasks").observe(
            time.perf_counter() - start
        )

        if cached:
            REDIS_CACHE_HITS_TOTAL.labels(cache="olympiad_tasks").inc()
            try:
                data = json.loads(cached)
                return data
            except Exception:
                pass
        else:
            REDIS_CACHE_MISSES_TOTAL.labels(cache="olympiad_tasks").inc()

        rows = await self.repo.list_tasks_full(olympiad_id)
        payload = []
        for olymp_task, task in rows:
            payload.append(
                {
                    "olymp_task": {
                        "task_id": olymp_task.task_id,
                        "sort_order": olymp_task.sort_order,
                        "max_score": olymp_task.max_score,
                    },
                    "task": {
                        "id": task.id,
                        "title": task.title,
                        "content": task.content,
                        "task_type": self._serialize_task_type(task.task_type),
                        "image_key": task.image_key,
                        "payload": task.payload,
                    },
                }
            )

        start = time.perf_counter()
        try:
            await redis.set(
                cache_key,
                json.dumps(payload),
                ex=settings.OLYMPIAD_TASKS_CACHE_TTL_SEC,
            )
        except Exception:
            pass
        REDIS_OP_LATENCY_SECONDS.labels(op="set", cache="olympiad_tasks").observe(
            time.perf_counter() - start
        )

        return payload

    async def _get_olympiad_cached(self, olympiad_id: int):
        redis = await safe_redis()
        if redis is None:
            return await self.repo.get_olympiad(olympiad_id)

        cache_key = olympiad_meta_key(olympiad_id)
        cached = None
        start = time.perf_counter()
        try:
            cached = await redis.get(cache_key)
        except Exception:
            cached = None
        REDIS_OP_LATENCY_SECONDS.labels(op="get", cache="olympiad_meta").observe(
            time.perf_counter() - start
        )

        if cached:
            REDIS_CACHE_HITS_TOTAL.labels(cache="olympiad_meta").inc()
            try:
                data = json.loads(cached)
                if "age_group" not in data:
                    raise ValueError("cache_missing_age_group")
                if "results_released" not in data:
                    olympiad = await self.repo.get_olympiad(olympiad_id)
                    data["results_released"] = bool(
                        getattr(olympiad, "results_released", False)
                    )
                    start = time.perf_counter()
                    try:
                        await redis.set(
                            cache_key,
                            json.dumps(data),
                            ex=settings.OLYMPIAD_TASKS_CACHE_TTL_SEC,
                        )
                    except Exception:
                        pass
                    REDIS_OP_LATENCY_SECONDS.labels(op="set", cache="olympiad_meta").observe(
                        time.perf_counter() - start
                    )
                else:
                    data["results_released"] = bool(data.get("results_released"))
                data["available_from"] = datetime.fromisoformat(data["available_from"])
                data["available_to"] = datetime.fromisoformat(data["available_to"])
                return SimpleNamespace(**data)
            except Exception:
                pass
        else:
            REDIS_CACHE_MISSES_TOTAL.labels(cache="olympiad_meta").inc()

        olympiad = await self.repo.get_olympiad(olympiad_id)
        if not olympiad:
            return None

        payload = {
            "id": olympiad.id,
            "title": olympiad.title,
            "is_published": olympiad.is_published,
            "age_group": self._normalize_age_group(olympiad.age_group),
            "available_from": olympiad.available_from.isoformat(),
            "available_to": olympiad.available_to.isoformat(),
            "duration_sec": olympiad.duration_sec,
            "pass_percent": olympiad.pass_percent,
            "attempts_limit": olympiad.attempts_limit,
            "results_released": olympiad.results_released,
        }
        start = time.perf_counter()
        try:
            await redis.set(
                cache_key,
                json.dumps(payload),
                ex=settings.OLYMPIAD_TASKS_CACHE_TTL_SEC,
            )
        except Exception:
            pass
        REDIS_OP_LATENCY_SECONDS.labels(op="set", cache="olympiad_meta").observe(
            time.perf_counter() - start
        )

        payload["available_from"] = olympiad.available_from
        payload["available_to"] = olympiad.available_to
        return SimpleNamespace(**payload)

    @staticmethod
    def _inflate_tasks(
        rows: list[dict],
    ) -> list[tuple]:
        inflated = []
        for row in rows:
            ot = row["olymp_task"]
            t = row["task"]
            inflated.append(
                (
                    SimpleNamespace(
                        task_id=ot["task_id"],
                        sort_order=ot["sort_order"],
                        max_score=ot["max_score"],
                    ),
                    SimpleNamespace(
                        id=t["id"],
                        title=t["title"],
                        content=t["content"],
                        task_type=TaskType(t["task_type"]),
                        image_key=t.get("image_key"),
                        payload=t["payload"],
                    ),
                )
            )
        return inflated

    @staticmethod
    def _validate_answer_payload(task_type: TaskType, task_payload: dict, answer_payload: dict) -> dict:
        if not isinstance(answer_payload, dict):
            raise ValueError(codes.INVALID_ANSWER_PAYLOAD)

        if task_type == TaskType.single_choice:
            choice_id = answer_payload.get("choice_id")
            if not isinstance(choice_id, str):
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            options = task_payload.get("options") or []
            ids = {o.get("id") for o in options if isinstance(o, dict)}
            if choice_id not in ids:
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            return {"choice_id": choice_id}

        if task_type == TaskType.multi_choice:
            choice_ids = answer_payload.get("choice_ids")
            if not isinstance(choice_ids, list) or len(choice_ids) == 0:
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            if any(not isinstance(cid, str) for cid in choice_ids):
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            if len(set(choice_ids)) != len(choice_ids):
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            options = task_payload.get("options") or []
            ids = {o.get("id") for o in options if isinstance(o, dict)}
            if any(cid not in ids for cid in choice_ids):
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            return {"choice_ids": choice_ids}

        if task_type == TaskType.short_text:
            text = answer_payload.get("text")
            if not isinstance(text, str):
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            trimmed = text.strip()
            if trimmed == "":
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            subtype = task_payload.get("subtype")
            if subtype == "int" and not re.fullmatch(r"-?\d+", trimmed):
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            if subtype == "float" and not re.fullmatch(r"-?\d+(?:[.,]\d+)?", trimmed):
                raise ValueError(codes.INVALID_ANSWER_PAYLOAD)
            return {"text": trimmed}

        raise ValueError(codes.INVALID_ANSWER_PAYLOAD)

    @staticmethod
    def _normalize_spaces(value: str) -> str:
        return " ".join(value.split())

    def _grade_task(self, task_type: TaskType, task_payload: dict, answer_payload: dict | None) -> bool:
        if answer_payload is None:
            return False

        if task_type == TaskType.single_choice:
            correct_id = task_payload.get("correct_option_id")
            return answer_payload.get("choice_id") == correct_id

        if task_type == TaskType.multi_choice:
            correct_ids = set(task_payload.get("correct_option_ids") or [])
            choice_ids = set(answer_payload.get("choice_ids") or [])
            return choice_ids == correct_ids

        if task_type == TaskType.short_text:
            subtype = task_payload.get("subtype")
            expected = task_payload.get("expected")
            raw_text = (answer_payload.get("text") or "").strip()

            if subtype == "int":
                try:
                    got = int(raw_text)
                    exp = int(expected)
                except (TypeError, ValueError):
                    return False
                return got == exp

            if subtype == "float":
                eps = task_payload.get("epsilon", 0.01)
                try:
                    got = float(raw_text.replace(",", "."))
                    exp = float(str(expected).replace(",", "."))
                    eps_val = float(eps)
                except (TypeError, ValueError):
                    return False
                return abs(got - exp) <= eps_val

            if subtype == "text":
                exp = str(expected).strip()
                got = raw_text
                if task_payload.get("case_insensitive", True):
                    exp = exp.lower()
                    got = got.lower()
                if task_payload.get("collapse_spaces", False):
                    exp = self._normalize_spaces(exp)
                    got = self._normalize_spaces(got)
                return got == exp

        return False

    async def start_attempt(self, *, user: User, olympiad_id: int):
        return await self._start_attempt(user=user, olympiad_id=olympiad_id, by_code=False)

    async def start_attempt_by_code(self, *, user: User, code: str):
        return await self._start_attempt(user=user, olympiad_id=olympiad_id_from_code(code), by_code=True)

    async def _start_attempt(self, *, user: User, olympiad_id: int, by_code: bool):
        olympiad = await self.repo.get_olympiad(olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        if not user.is_email_verified:
            raise ValueError(codes.EMAIL_NOT_VERIFIED)

        await self.repo.lock_user_for_start(user.id)
        if isinstance(user, User):
            user = await UsersRepo(self.repo.db).get_by_id(user.id, minimal=True)
            if not user or not user.is_active or user.role != UserRole.student:
                raise ValueError(codes.FORBIDDEN)
            if not user.is_email_verified:
                raise ValueError(codes.EMAIL_NOT_VERIFIED)
        existing = await self.repo.get_attempt_by_user_olympiad(user.id, olympiad_id)
        if existing:
            if existing.status == AttemptStatus.active and self._now_utc() > existing.deadline_at:
                existing = await self._ensure_attempt_access(user=user, attempt_id=existing.id)
                await self._finalize_locked(existing, expired=True)
            await self.repo.db.commit()
            if by_code and existing.status != AttemptStatus.active:
                raise http_error(409, codes.ATTEMPT_ALREADY_USED,
                                 details={"attempt_id": existing.id, "status": existing.status.value})
            return existing, olympiad

        if user.school_status not in {
            SchoolStatus.selected,
            SchoolStatus.submission_pending,
            SchoolStatus.not_required,
        }:
            raise ValueError(codes.SCHOOL_PROFILE_REQUIRED)

        now = self._now_utc()
        if now < olympiad.available_from or now > olympiad.available_to:
            raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
        if not self._age_group_allows(class_grade=user.class_grade, age_group=olympiad.age_group):
            raise ValueError(codes.OLYMPIAD_AGE_GROUP_MISMATCH)

        active = await self.repo.get_active_attempt(user.id)
        if active and active.deadline_at < now:
            await self._finalize_locked(active, expired=True)
            active = None
        if active:
            raise http_error(409, codes.ACTIVE_ATTEMPT_EXISTS, details={"attempt_id": active.id, "action": "continue"})
        pools = OlympiadPoolsRepo(self.repo.db)
        if by_code or getattr(olympiad, "is_standalone", False):
            olympiad = await pools.lock_variant_for_code_start(olympiad_id)
            if olympiad is None:
                raise ValueError(codes.OLYMPIAD_NOT_FOUND)
            if not by_code and not olympiad.is_standalone:
                raise ValueError(codes.OLYMPIAD_NOT_ASSIGNED)
            if olympiad.archived_at:
                raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
            if not olympiad.is_published:
                raise ValueError(codes.OLYMPIAD_NOT_PUBLISHED)
            if not self._age_group_allows(class_grade=user.class_grade, age_group=olympiad.age_group):
                raise ValueError(codes.OLYMPIAD_AGE_GROUP_MISMATCH)
            rows = await self.repo.list_tasks_full(olympiad_id)
            if not rows:
                raise ValueError(codes.OLYMPIAD_HAS_NO_TASKS)
            for link, task in rows:
                if link.max_score <= 0 or link.sort_order < 0:
                    raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
                try:
                    TaskCreate(subject=task.subject, title=task.title, content=task.content,
                               task_type=task.task_type, image_key=task.image_key, payload=task.payload)
                except ValueError:
                    raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
        else:
            pool_id = await pools.pool_id_for_variant(olympiad_id)
            if pool_id is None:
                raise ValueError(codes.OLYMPIAD_NOT_ASSIGNED)
            service = OlympiadPoolsService(pools, OlympiadAssignmentsRepo(self.repo.db), OlympiadsRepo(self.repo.db))
            bundle = await pools.load_bundle(pool_id, lock="share", full=False)
            chosen = await service.chosen_variant(user, bundle, now=self._now_utc())
            if chosen.id != olympiad_id:
                raise ValueError(codes.OLYMPIAD_NOT_ASSIGNED)
            olympiad = chosen

        # Loading task metadata must not let a start slip past the closing time.
        now = self._now_utc()
        if now < olympiad.available_from or now > olympiad.available_to:
            raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
        deadline = now + timedelta(seconds=int(olympiad.duration_sec))
        if not by_code and not getattr(olympiad, "is_standalone", False):
            await service.remember(user.id, pool_id, olympiad_id)
        attempt = await self.repo.create_attempt(
            user_id=user.id,
            olympiad_id=olympiad_id,
            started_at=now,
            deadline_at=deadline,
            duration_sec=int(olympiad.duration_sec),
        )
        if by_code:
            add_audit_event(self.repo.db, actor_user_id=user.id, action="attempt_started_by_code",
                            method="POST", path="/api/v1/attempts/start-by-code",
                            details={"olympiad_id": olympiad_id, "attempt_id": attempt.id})
        await self.repo.db.commit()
        ATTEMPTS_STARTED_TOTAL.inc()
        return attempt, olympiad

    async def _ensure_attempt_access(self, *, user: User, attempt_id: int, lock: bool = True):
        attempt = await self.repo.get_attempt(attempt_id)
        if not attempt:
            raise ValueError(codes.ATTEMPT_NOT_FOUND)
        if (user.role == UserRole.student and attempt.user_id != user.id) or user.role == UserRole.teacher:
            raise ValueError(codes.FORBIDDEN)
        return await self._lock_attempt(attempt) if lock else attempt

    async def _lock_attempt(self, attempt):
        # Same lock order as start/account deletion: user, then attempt.
        await self.repo.lock_user_for_start(attempt.user_id)
        row = await self.repo.db.execute(select(Attempt).where(Attempt.id == attempt.id)
            .with_for_update().execution_options(populate_existing=True))
        attempt = row.scalar_one_or_none()
        if attempt is None:
            raise ValueError(codes.ATTEMPT_NOT_FOUND)
        return attempt

    async def _finalize_locked(self, attempt: Attempt, *, expired: bool = False, submitted_at: datetime | None = None, tasks=None, answers_by_task=None):
        """Caller holds user/attempt locks; flush only, never regrade terminal rows."""
        if attempt.status != AttemptStatus.active:
            return attempt.status
        olympiad = await self.repo.get_olympiad(attempt.olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        if tasks is None:
            tasks = await self.repo.list_tasks_full(attempt.olympiad_id)
        if answers_by_task is None:
            answers_by_task = {a.task_id: a.answer_payload for a in await self.repo.list_answers(attempt.id)}
        now = self._now_utc()
        finish_requested_at = submitted_at or now
        terminal = AttemptStatus.expired if expired or finish_requested_at > attempt.deadline_at else AttemptStatus.submitted
        score_total = score_max = 0
        grades = []
        for link, task in tasks:
            maximum = int(link.max_score)
            correct = self._grade_task(task.task_type, task.payload, answers_by_task.get(task.id))
            score = maximum if correct else 0
            score_total += score
            score_max += maximum
            grades.append(AttemptTaskGrade(attempt_id=attempt.id, task_id=task.id,
                is_correct=correct, score=score, max_score=maximum, graded_at=now))
        self.repo.db.add_all(grades)
        attempt.score_total = score_total
        attempt.score_max = score_max
        attempt.passed = score_total >= math.ceil(score_max * int(olympiad.pass_percent) / 100)
        attempt.graded_at = now
        attempt.finished_at = attempt.deadline_at if terminal == AttemptStatus.expired else finish_requested_at
        attempt.status = terminal
        await self.repo.db.flush()
        return terminal

    async def get_attempt_view(self, *, user: User, attempt_id: int):
        attempt = await self._ensure_attempt_access(user=user, attempt_id=attempt_id, lock=False)
        if attempt.status == AttemptStatus.active:
            # Read answers and their revision under the same lock. Closed history
            # is immutable and needs no writer lock.
            attempt = await self._lock_attempt(attempt)
            if self._now_utc() > attempt.deadline_at:
                await self._finalize_locked(attempt, expired=True)
        answers = await self.repo.list_answers(attempt.id)
        await self.repo.db.commit()
        # No Redis/network access while database locks are held.
        olympiad = await self._get_olympiad_cached(attempt.olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        tasks = self._inflate_tasks(await self._get_tasks_cached(attempt.olympiad_id))
        return attempt, olympiad, tasks, {a.task_id: a for a in answers}

    @staticmethod
    def _check_revision(attempt, expected_revision):
        if expected_revision is None:
            raise http_error(409, codes.ANSWERS_REVISION_REQUIRED, details={"reload": True})
        current = attempt.answers_revision or 0
        if current != expected_revision:
            raise http_error(409, codes.ANSWERS_REVISION_CONFLICT, details={"answers_revision": current})

    async def upsert_answer(self, *, user: User, attempt_id: int, task_id: int,
                            answer_payload: dict | None, expected_revision: int):
        attempt = await self._ensure_attempt_access(user=user, attempt_id=attempt_id)
        if attempt.status != AttemptStatus.active:
            raise ValueError(codes.ATTEMPT_NOT_ACTIVE)
        now = self._now_utc()
        if now > attempt.deadline_at:
            await self._finalize_locked(attempt, expired=True)
            await self.repo.db.commit()
            raise ValueError(codes.ATTEMPT_EXPIRED)
        self._check_revision(attempt, expected_revision)
        match = await self.repo.get_task_for_answer(attempt.olympiad_id, task_id)
        if not match:
            raise ValueError(codes.TASK_NOT_FOUND)
        normalized = None if answer_payload is None else self._validate_answer_payload(match[1].task_type, match[1].payload, answer_payload)
        now = self._now_utc()
        if now > attempt.deadline_at:
            await self._finalize_locked(attempt, expired=True)
            await self.repo.db.commit()
            raise ValueError(codes.ATTEMPT_EXPIRED)
        if normalized is None:
            await self.repo.delete_answer(attempt.id, task_id)
        else:
            await self.repo.upsert_answer(attempt_id=attempt.id, task_id=task_id,
                                         answer_payload=normalized, updated_at=now)
        attempt.answers_revision = (attempt.answers_revision or 0) + 1
        await self.repo.db.commit()
        return {"status": attempt.status, "answers_revision": attempt.answers_revision}

    async def submit(self, *, user: User, attempt_id: int, expected_revision: int | None = None,
                     answers: list | None = None):
        attempt = await self._ensure_attempt_access(user=user, attempt_id=attempt_id)
        was_active = attempt.status == AttemptStatus.active
        if was_active:
            now = self._now_utc()
            tasks = normalized = None
            if now <= attempt.deadline_at:
                self._check_revision(attempt, expected_revision)
                if answers is not None:
                    tasks = await self.repo.list_tasks_full(attempt.olympiad_id)
                    by_task = {task.id: task for _, task in tasks}
                    if len(answers) != len(by_task) or {answer.task_id for answer in answers} != set(by_task):
                        raise http_error(422, codes.INCOMPLETE_ANSWER_SNAPSHOT)
                    normalized = {}
                    for answer in answers:
                        try:
                            task = by_task[answer.task_id]
                            normalized[task.id] = None if answer.answer_payload is None else self._validate_answer_payload(
                                task.task_type, task.payload, answer.answer_payload)
                        except ValueError:
                            raise http_error(422, codes.INVALID_ANSWER_PAYLOAD, details={"task_id": answer.task_id})
                if (now-attempt.started_at).total_seconds() < max(int(settings.ATTEMPT_MIN_SUBMIT_AGE_SEC), 0):
                    has_answers = any(value is not None for value in normalized.values()) if normalized is not None else bool(await self.repo.list_answers(attempt.id))
                    if not has_answers:
                        raise ValueError(codes.ATTEMPT_SUBMIT_TOO_EARLY)
                # Validation may cross the deadline: do not admit the new body late.
                now = self._now_utc()
                if normalized is not None and now <= attempt.deadline_at:
                    await self.repo.replace_answers(attempt.id, normalized, now)
                    attempt.answers_revision = (attempt.answers_revision or 0) + 1
                elif now > attempt.deadline_at:
                    normalized = None
            await self._finalize_locked(attempt, submitted_at=now, tasks=tasks, answers_by_task=normalized)
        await self.repo.db.commit()
        if was_active: ATTEMPTS_SUBMITTED_TOTAL.labels(status=attempt.status.value).inc()
        return attempt.status

    @staticmethod
    def _result_percent(score_total: int, score_max: int) -> int:
        if score_max <= 0:
            return 0
        return int(round((score_total / score_max) * 100))

    async def get_result(self, *, user: User, attempt_id: int):
        attempt_tuple = await self.repo.get_attempt_with_olympiad(attempt_id)
        if not attempt_tuple:
            raise ValueError(codes.ATTEMPT_NOT_FOUND)
        attempt, olympiad = attempt_tuple
        if attempt.user_id != user.id:
            raise ValueError(codes.FORBIDDEN)
        percent = self._result_percent(attempt.score_total, attempt.score_max)
        return {
            "attempt_id": attempt.id,
            "olympiad_id": attempt.olympiad_id,
            "olympiad_title": olympiad.title,
            "olympiad_available_from": olympiad.available_from,
            "status": attempt.status,
            "score_total": attempt.score_total,
            "score_max": attempt.score_max,
            "percent": percent,
            "passed": attempt.passed,
            "graded_at": attempt.graded_at,
            "started_at": attempt.started_at,
            "deadline_at": attempt.deadline_at,
            "finished_at": attempt.finished_at,
            "results_released": olympiad.results_released,
        }

    async def list_results(self, *, user: User):
        if user.role != UserRole.student:
            raise ValueError(codes.FORBIDDEN)
        attempts = await self.repo.list_attempts_with_olympiads_for_user(user.id)
        results = []
        now = self._now_utc()
        for attempt, olympiad in attempts:
            needs_grade = False
            if attempt.status == AttemptStatus.active and now > attempt.deadline_at:
                needs_grade = True
            if needs_grade:
                attempt, olympiad, _tasks, _answers = await self.get_attempt_view(
                    user=user,
                    attempt_id=attempt.id,
                )
            results.append(
                {
                    "attempt_id": attempt.id,
                    "olympiad_id": attempt.olympiad_id,
                    "olympiad_title": olympiad.title,
                    "olympiad_available_from": olympiad.available_from,
                    "status": attempt.status,
                    "score_total": attempt.score_total,
                    "score_max": attempt.score_max,
                    "percent": self._result_percent(attempt.score_total, attempt.score_max),
                    "passed": attempt.passed,
                    "graded_at": attempt.graded_at,
                    "started_at": attempt.started_at,
                    "deadline_at": attempt.deadline_at,
                    "finished_at": attempt.finished_at,
                    "results_released": olympiad.results_released,
                }
            )
        return results
