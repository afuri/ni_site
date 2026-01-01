"""Attempts service."""
from datetime import datetime, timedelta, timezone

from app.models.attempt import AttemptStatus
from app.models.user import User, UserRole
from app.repos.attempts import AttemptsRepo


class AttemptsService:
    def __init__(self, repo: AttemptsRepo):
        self.repo = repo

    @staticmethod
    def _now_utc() -> datetime:
        return datetime.now(timezone.utc)

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

        tasks = await self.repo.list_tasks(olympiad_id)
        if len(tasks) == 0:
            # защищаемся от "пустой" опубликованной олимпиады
            raise ValueError("olympiad_has_no_tasks")

        now = self._now_utc()
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

    async def upsert_answer(self, *, user: User, attempt_id: int, task_id: int, answer_text: str):
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
        task = next((t for t in tasks if t.id == task_id), None)
        if not task:
            raise ValueError("task_not_found")

        trimmed = answer_text.strip()
        if len(trimmed) > int(task.answer_max_len):
            raise ValueError("answer_too_long")

        await self.repo.upsert_answer(
            attempt_id=attempt.id,
            task_id=task_id,
            answer_text=trimmed,
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

        # иначе закрываем как submitted
        if attempt.status == AttemptStatus.active:
            await self.repo.mark_submitted(attempt.id)
            return AttemptStatus.submitted

        return attempt.status
