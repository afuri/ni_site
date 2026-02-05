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
from app.core.redis import get_redis, safe_redis
from app.core.cache import olympiad_tasks_key, olympiad_meta_key
from app.core.age_groups import class_grades_allow, normalize_age_group
from app.core.security import generate_token
from app.models.attempt import AttemptStatus
from app.models.task import TaskType
from app.models.user import User, UserRole
from app.repos.attempts import AttemptsRepo
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
            return {**image_payload, "options": options or []}
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
        olympiad = await self._get_olympiad_cached(olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        if not olympiad.is_published:
            raise ValueError(codes.OLYMPIAD_NOT_PUBLISHED)
        if not user.is_email_verified:
            raise ValueError(codes.EMAIL_NOT_VERIFIED)

        existing = await self.repo.get_attempt_by_user_olympiad(user.id, olympiad_id)
        if existing:
            # идемпотентный старт: возвращаем текущую попытку
            return existing, olympiad

        now = self._now_utc()
        if now < olympiad.available_from or now > olympiad.available_to:
            raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
        if not self._age_group_allows(class_grade=user.class_grade, age_group=olympiad.age_group):
            raise ValueError(codes.OLYMPIAD_AGE_GROUP_MISMATCH)

        cached = await self._get_tasks_cached(olympiad_id)
        tasks = self._inflate_tasks(cached)
        if len(tasks) == 0:
            # защищаемся от "пустой" опубликованной олимпиады
            raise ValueError(codes.OLYMPIAD_HAS_NO_TASKS)

        deadline = now + timedelta(seconds=int(olympiad.duration_sec))
        if olympiad.available_to and deadline > olympiad.available_to:
            deadline = olympiad.available_to
        attempt = await self.repo.create_attempt(
            user_id=user.id,
            olympiad_id=olympiad_id,
            started_at=now,
            deadline_at=deadline,
            duration_sec=int(olympiad.duration_sec),
        )
        ATTEMPTS_STARTED_TOTAL.inc()
        return attempt, olympiad

    async def _ensure_attempt_access(self, *, user: User, attempt_id: int):
        attempt = await self.repo.get_attempt(attempt_id)
        if not attempt:
            raise ValueError(codes.ATTEMPT_NOT_FOUND)

        # студент видит только свою попытку; учитель — через отдельные эндпоинты
        if user.role == UserRole.student and attempt.user_id != user.id:
            raise ValueError(codes.FORBIDDEN)
        if user.role == UserRole.teacher:
            raise ValueError(codes.FORBIDDEN)
        return attempt

    async def get_attempt_view(self, *, user: User, attempt_id: int):
        attempt = await self._ensure_attempt_access(user=user, attempt_id=attempt_id)

        olympiad = await self._get_olympiad_cached(attempt.olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)

        cached = await self._get_tasks_cached(attempt.olympiad_id)
        tasks = self._inflate_tasks(cached)
        answers = await self.repo.list_answers(attempt.id)
        answers_by_task = {a.task_id: a for a in answers}

        # авто-expire при чтении, если дедлайн прошёл
        now = self._now_utc()
        if attempt.status == AttemptStatus.active and now > attempt.deadline_at:
            await self.repo.mark_expired(attempt.id)
            attempt = await self.repo.get_attempt(attempt.id)  # refresh

        return attempt, olympiad, tasks, answers_by_task

    async def upsert_answer(self, *, user: User, attempt_id: int, task_id: int, answer_payload: dict):
        attempt = await self._ensure_attempt_access(user=user, attempt_id=attempt_id)

        now = self._now_utc()
        # если время вышло — фиксируем expired и запрещаем запись
        if attempt.status != AttemptStatus.active:
            raise ValueError(codes.ATTEMPT_NOT_ACTIVE)

        if now > attempt.deadline_at:
            await self.repo.mark_expired(attempt.id)
            raise ValueError(codes.ATTEMPT_EXPIRED)

        # убедимся, что task принадлежит олимпиаде попытки
        cached = await self._get_tasks_cached(attempt.olympiad_id)
        tasks = self._inflate_tasks(cached)
        match = next(((ot, t) for ot, t in tasks if ot.task_id == task_id), None)
        if not match:
            raise ValueError(codes.TASK_NOT_FOUND)
        _olymp_task, task = match

        normalized = self._validate_answer_payload(task.task_type, task.payload, answer_payload)

        await self.repo.upsert_answer(
            attempt_id=attempt.id,
            task_id=task_id,
            answer_payload=normalized,
            updated_at=now,
        )

        return {"status": attempt.status}

    async def submit(self, *, user: User, attempt_id: int):
        attempt = await self._ensure_attempt_access(user=user, attempt_id=attempt_id)

        if attempt.status == AttemptStatus.submitted:
            return attempt.status  # идемпотентно

        lock_key = f"lock:submit:{attempt.id}"
        lock_token = generate_token()
        redis = None
        locked = False
        try:
            redis = await get_redis()
            locked = await redis.set(lock_key, lock_token, nx=True, ex=settings.SUBMIT_LOCK_TTL_SEC)
        except Exception:
            locked = True  # fallback without lock if Redis is unavailable

        if not locked:
            attempt = await self.repo.get_attempt(attempt_id)
            if attempt and attempt.status == AttemptStatus.submitted:
                return AttemptStatus.submitted
            return attempt.status if attempt else AttemptStatus.expired

        now = self._now_utc()
        try:
            if attempt.status == AttemptStatus.active and now > attempt.deadline_at:
                await self.repo.mark_expired(attempt.id)
                ATTEMPTS_SUBMITTED_TOTAL.labels(status="expired").inc()
                return AttemptStatus.expired

            # иначе закрываем как submitted + оцениваем
            if attempt.status == AttemptStatus.active:
                olympiad = await self._get_olympiad_cached(attempt.olympiad_id)
                if not olympiad:
                    raise ValueError(codes.OLYMPIAD_NOT_FOUND)

                cached = await self._get_tasks_cached(attempt.olympiad_id)
                tasks = self._inflate_tasks(cached)
                answers = await self.repo.list_answers(attempt.id)
                answers_by_task = {a.task_id: a for a in answers}

                score_total = 0
                score_max = 0
                now_ts = self._now_utc()

                await self.repo.delete_grades(attempt.id)
                for olymp_task, task in tasks:
                    score_max += int(olymp_task.max_score)
                    answer = answers_by_task.get(task.id)
                    answer_payload = None if answer is None else answer.answer_payload
                    is_correct = self._grade_task(task.task_type, task.payload, answer_payload)
                    score = int(olymp_task.max_score) if is_correct else 0
                    score_total += score

                    await self.repo.add_grade(
                        attempt_id=attempt.id,
                        task_id=task.id,
                        is_correct=is_correct,
                        score=score,
                        max_score=int(olymp_task.max_score),
                        graded_at=now_ts,
                    )

                pass_score = math.ceil(score_max * int(olympiad.pass_percent) / 100) if score_max > 0 else 0
                passed = score_total >= pass_score

                await self.repo.mark_submitted_with_grade(
                    attempt_id=attempt.id,
                    score_total=score_total,
                    score_max=score_max,
                    passed=passed,
                    graded_at=now_ts,
                )
                ATTEMPTS_SUBMITTED_TOTAL.labels(status="submitted").inc()
                return AttemptStatus.submitted

            return attempt.status
        finally:
            if redis is not None:
                try:
                    current = await redis.get(lock_key)
                    if current == lock_token:
                        await redis.delete(lock_key)
                except Exception:
                    pass

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
            "status": attempt.status,
            "score_total": attempt.score_total,
            "score_max": attempt.score_max,
            "percent": percent,
            "passed": attempt.passed,
            "graded_at": attempt.graded_at,
            "results_released": olympiad.results_released,
        }

    async def list_results(self, *, user: User):
        if user.role != UserRole.student:
            raise ValueError(codes.FORBIDDEN)
        attempts = await self.repo.list_attempts_with_olympiads_for_user(user.id)
        results = []
        for attempt, olympiad in attempts:
            results.append(
                {
                    "attempt_id": attempt.id,
                    "olympiad_id": attempt.olympiad_id,
                    "olympiad_title": olympiad.title,
                    "status": attempt.status,
                    "score_total": attempt.score_total,
                    "score_max": attempt.score_max,
                    "percent": self._result_percent(attempt.score_total, attempt.score_max),
                    "passed": attempt.passed,
                    "graded_at": attempt.graded_at,
                    "results_released": olympiad.results_released,
                }
            )
        return results
