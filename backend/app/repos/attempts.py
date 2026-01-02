"""Attempt repository."""
from datetime import datetime
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.models.attempt import Attempt, AttemptAnswer, AttemptStatus
from app.models.olympiad import Olympiad
from app.models.olympiad_task import OlympiadTask


class AttemptsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_olympiad(self, olympiad_id: int) -> Olympiad | None:
        res = await self.db.execute(select(Olympiad).where(Olympiad.id == olympiad_id))
        return res.scalar_one_or_none()

    async def list_tasks(self, olympiad_id: int) -> list[OlympiadTask]:
        res = await self.db.execute(
            select(OlympiadTask)
            .where(OlympiadTask.olympiad_id == olympiad_id)
            .order_by(OlympiadTask.sort_order.asc(), OlympiadTask.id.asc())
        )
        return list(res.scalars().all())

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
        )
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def mark_submitted(self, attempt_id: int) -> None:
        await self.db.execute(
            update(Attempt)
            .where(Attempt.id == attempt_id)
            .values(status=AttemptStatus.submitted)
        )
        await self.db.commit()

    async def mark_expired(self, attempt_id: int) -> None:
        await self.db.execute(
            update(Attempt)
            .where(Attempt.id == attempt_id)
            .values(status=AttemptStatus.expired)
        )
        await self.db.commit()

    async def list_answers(self, attempt_id: int) -> list[AttemptAnswer]:
        res = await self.db.execute(select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id))
        return list(res.scalars().all())

    async def upsert_answer(self, *, attempt_id: int, task_id: int, answer_text: str, updated_at: datetime) -> AttemptAnswer:
        stmt = insert(AttemptAnswer).values(
            attempt_id=attempt_id,
            task_id=task_id,
            answer_text=answer_text,
            updated_at=updated_at,
        ).on_conflict_do_update(
            index_elements=["attempt_id", "task_id"],
            set_={"answer_text": answer_text, "updated_at": updated_at},
        ).returning(AttemptAnswer)

        res = await self.db.execute(stmt)
        await self.db.commit()
        row = res.scalar_one()
        return row

    async def list_attempts_for_olympiad(self, olympiad_id: int) -> list[Attempt]:
        res = await self.db.execute(
            select(Attempt).where(Attempt.olympiad_id == olympiad_id).order_by(Attempt.id.desc())
        )
        return list(res.scalars().all())

    async def list_attempts_for_olympiad_with_users(self, olympiad_id: int):
        # Оставим на будущее join с users; сейчас минимально — попытки.
        return await self.list_attempts_for_olympiad(olympiad_id)
