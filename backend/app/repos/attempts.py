"""Attempt repository."""
from datetime import datetime
from sqlalchemy import select, text, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.models.attempt import Attempt, AttemptAnswer, AttemptStatus, AttemptTaskGrade
from app.models.olympiad import Olympiad
from app.models.olympiad_task import OlympiadTask
from app.models.task import Task
from app.models.user import User
from app.repos.olympiad_tasks import OlympiadTasksRepo


class AttemptsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def lock_user_for_start(self, user_id: int) -> None:
        # Serializes only starts for this user, across all API replicas. The
        # transaction is held until create_attempt commits (or the request rolls back).
        await self.db.execute(text("SET LOCAL lock_timeout = '5s'"))
        await self.db.execute(select(User.id).where(User.id == user_id).with_for_update())

    async def get_active_attempt(self, user_id: int) -> Attempt | None:
        return await self.db.scalar(select(Attempt).where(Attempt.user_id == user_id,
            Attempt.status == AttemptStatus.active).order_by(Attempt.id).with_for_update()
            .execution_options(populate_existing=True))

    async def get_olympiad(self, olympiad_id: int) -> Olympiad | None:
        res = await self.db.execute(select(Olympiad).where(Olympiad.id == olympiad_id))
        return res.scalar_one_or_none()

    async def list_tasks_full(self, olympiad_id: int):
        return await OlympiadTasksRepo(self.db).list_full_by_olympiad(olympiad_id)

    async def get_task_for_answer(self, olympiad_id: int, task_id: int):
        return (await self.db.execute(select(OlympiadTask, Task).join(Task, Task.id == OlympiadTask.task_id)
            .where(OlympiadTask.olympiad_id == olympiad_id, OlympiadTask.task_id == task_id))).first()

    async def delete_answer(self, attempt_id: int, task_id: int):
        await self.db.execute(delete(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id,
                                                         AttemptAnswer.task_id == task_id))

    async def replace_answers(self, attempt_id: int, answers: dict, updated_at: datetime):
        await self.db.execute(delete(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id))
        rows = [{"attempt_id": attempt_id, "task_id": tid, "answer_payload": payload,
                 "updated_at": updated_at} for tid, payload in answers.items() if payload is not None]
        if rows:
            await self.db.execute(insert(AttemptAnswer), rows)

    async def get_attempt(self, attempt_id: int) -> Attempt | None:
        res = await self.db.execute(select(Attempt).where(Attempt.id == attempt_id))
        return res.scalar_one_or_none()

    async def get_attempt_by_user_olympiad(self, user_id: int, olympiad_id: int) -> Attempt | None:
        res = await self.db.execute(
            select(Attempt).where(Attempt.user_id == user_id, Attempt.olympiad_id == olympiad_id)
        )
        return res.scalar_one_or_none()

    async def create_attempt(self, *, user_id: int, olympiad_id: int, started_at: datetime, deadline_at: datetime, duration_sec: int) -> Attempt:
        obj = Attempt(
            user_id=user_id,
            olympiad_id=olympiad_id,
            started_at=started_at,
            deadline_at=deadline_at,
            duration_sec=duration_sec,
            status=AttemptStatus.active,
            answers_revision=0,
        )
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def list_answers(self, attempt_id: int) -> list[AttemptAnswer]:
        res = await self.db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id))
        return list(res.scalars().all())

    async def upsert_answer(self, *, attempt_id: int, task_id: int, answer_payload: dict, updated_at: datetime) -> AttemptAnswer:
        stmt = insert(AttemptAnswer).values(
            attempt_id=attempt_id,
            task_id=task_id,
            answer_payload=answer_payload,
            updated_at=updated_at,
        ).on_conflict_do_update(
            index_elements=["attempt_id", "task_id"],
            set_={"answer_payload": answer_payload, "updated_at": updated_at},
        ).returning(AttemptAnswer)

        res = await self.db.execute(stmt)
        await self.db.flush()
        row = res.scalar_one()
        return row

    async def list_grades(self, attempt_id: int) -> list[AttemptTaskGrade]:
        res = await self.db.execute(
            select(AttemptTaskGrade).where(AttemptTaskGrade.attempt_id == attempt_id)
        )
        return list(res.scalars().all())

    async def list_attempts_for_olympiad(self, olympiad_id: int) -> list[Attempt]:
        res = await self.db.execute(
            select(Attempt).where(Attempt.olympiad_id == olympiad_id).order_by(Attempt.id.desc())
        )
        return list(res.scalars().all())

    async def list_attempts_for_olympiad_with_users(self, olympiad_id: int):
        # Оставим на будущее join с users; сейчас минимально — попытки.
        return await self.list_attempts_for_olympiad(olympiad_id)

    async def list_attempts_for_user(self, user_id: int) -> list[Attempt]:
        res = await self.db.execute(
            select(Attempt).where(Attempt.user_id == user_id).order_by(Attempt.id.desc())
        )
        return list(res.scalars().all())

    async def list_attempts_with_olympiads_for_user(self, user_id: int) -> list[tuple[Attempt, Olympiad]]:
        res = await self.db.execute(
            select(Attempt, Olympiad)
            .join(Olympiad, Olympiad.id == Attempt.olympiad_id)
            .where(Attempt.user_id == user_id)
            .order_by(Attempt.id.desc())
        )
        return list(res.all())

    async def get_attempt_with_olympiad(self, attempt_id: int) -> tuple[Attempt, Olympiad] | None:
        res = await self.db.execute(
            select(Attempt, Olympiad)
            .join(Olympiad, Olympiad.id == Attempt.olympiad_id)
            .where(Attempt.id == attempt_id)
        )
        row = res.first()
        if not row:
            return None
        return row
