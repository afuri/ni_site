"""Attempts service."""
from datetime import datetime, timedelta, timezone
import math

from app.models.attempt import AttemptStatus
from app.models.task import TaskType
from app.models.user import User, UserRole
from app.repos.attempts import AttemptsRepo


class AttemptsService:
    def __init__(self, repo: AttemptsRepo):
        self.repo = repo

    @staticmethod
    def _now_utc() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _sanitize_task_payload(task_type: TaskType, payload: dict) -> dict:
        if task_type in (TaskType.single_choice, TaskType.multi_choice):
            options = payload.get("options") if isinstance(payload, dict) else None
            return {"options": options or []}
        if task_type == TaskType.short_text:
            return {
                "subtype": payload.get("subtype"),
                "epsilon": payload.get("epsilon"),
                "case_insensitive": payload.get("case_insensitive", True),
            }
        return {}

    @staticmethod
    def _validate_answer_payload(task_type: TaskType, task_payload: dict, answer_payload: dict) -> dict:
        if not isinstance(answer_payload, dict):
            raise ValueError("invalid_answer_payload")

        if task_type == TaskType.single_choice:
            choice_id = answer_payload.get("choice_id")
            if not isinstance(choice_id, str):
                raise ValueError("invalid_answer_payload")
            options = task_payload.get("options") or []
            ids = {o.get("id") for o in options if isinstance(o, dict)}
            if choice_id not in ids:
                raise ValueError("invalid_answer_payload")
            return {"choice_id": choice_id}

        if task_type == TaskType.multi_choice:
            choice_ids = answer_payload.get("choice_ids")
            if not isinstance(choice_ids, list) or len(choice_ids) == 0:
                raise ValueError("invalid_answer_payload")
            if any(not isinstance(cid, str) for cid in choice_ids):
                raise ValueError("invalid_answer_payload")
            if len(set(choice_ids)) != len(choice_ids):
                raise ValueError("invalid_answer_payload")
            options = task_payload.get("options") or []
            ids = {o.get("id") for o in options if isinstance(o, dict)}
            if any(cid not in ids for cid in choice_ids):
                raise ValueError("invalid_answer_payload")
            return {"choice_ids": choice_ids}

        if task_type == TaskType.short_text:
            text = answer_payload.get("text")
            if not isinstance(text, str):
                raise ValueError("invalid_answer_payload")
            trimmed = text.strip()
            if trimmed == "":
                raise ValueError("invalid_answer_payload")
            return {"text": trimmed}

        raise ValueError("invalid_answer_payload")

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
        olympiad = await self.repo.get_olympiad(olympiad_id)
        if not olympiad:
            raise ValueError("olympiad_not_found")
        if not olympiad.is_published:
            raise ValueError("olympiad_not_published")

        existing = await self.repo.get_attempt_by_user_olympiad(user.id, olympiad_id)
        if existing:
            # идемпотентный старт: возвращаем текущую попытку
            return existing, olympiad

        now = self._now_utc()
        if now < olympiad.available_from or now > olympiad.available_to:
            raise ValueError("olympiad_not_available")

        tasks = await self.repo.list_tasks(olympiad_id)
        if len(tasks) == 0:
            # защищаемся от "пустой" опубликованной олимпиады
            raise ValueError("olympiad_has_no_tasks")

        deadline = now + timedelta(seconds=int(olympiad.duration_sec))
        attempt = await self.repo.create_attempt(
            user_id=user.id,
            olympiad_id=olympiad_id,
            started_at=now,
            deadline_at=deadline,
            duration_sec=int(olympiad.duration_sec),
        )
        return attempt, olympiad

    async def _ensure_attempt_access(self, *, user: User, attempt_id: int):
        attempt = await self.repo.get_attempt(attempt_id)
        if not attempt:
            raise ValueError("attempt_not_found")

        # студент видит только свою попытку; учитель/админ — позже через отдельные эндпоинты
        if user.role == UserRole.student and attempt.user_id != user.id:
            raise ValueError("forbidden")
        return attempt

    async def get_attempt_view(self, *, user: User, attempt_id: int):
        attempt = await self._ensure_attempt_access(user=user, attempt_id=attempt_id)

        olympiad = await self.repo.get_olympiad(attempt.olympiad_id)
        if not olympiad:
            raise ValueError("olympiad_not_found")

        tasks = await self.repo.list_tasks(attempt.olympiad_id)
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
            raise ValueError("attempt_not_active")

        if now > attempt.deadline_at:
            await self.repo.mark_expired(attempt.id)
            raise ValueError("attempt_expired")

        # убедимся, что task принадлежит олимпиаде попытки
        tasks = await self.repo.list_tasks(attempt.olympiad_id)
        match = next(((ot, t) for ot, t in tasks if ot.task_id == task_id), None)
        if not match:
            raise ValueError("task_not_found")
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

        now = self._now_utc()
        if attempt.status == AttemptStatus.active and now > attempt.deadline_at:
            await self.repo.mark_expired(attempt.id)
            return AttemptStatus.expired

        # иначе закрываем как submitted + оцениваем
        if attempt.status == AttemptStatus.active:
            olympiad = await self.repo.get_olympiad(attempt.olympiad_id)
            if not olympiad:
                raise ValueError("olympiad_not_found")

            tasks = await self.repo.list_tasks(attempt.olympiad_id)
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
            return AttemptStatus.submitted

        return attempt.status
