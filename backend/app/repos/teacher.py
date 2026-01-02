from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.olympiad import Olympiad
from app.models.olympiad_task import OlympiadTask
from app.models.attempt import Attempt, AttemptAnswer


class TeacherRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_attempt_with_user(self, attempt_id: int):
        # Attempt + User (join)
        stmt = (
            select(Attempt, User)
            .join(User, User.id == Attempt.user_id)
            .where(Attempt.id == attempt_id)
        )
        res = await self.db.execute(stmt)
        row = res.first()
        if not row:
            return None
        attempt, user = row
        return attempt, user

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

    async def list_answers(self, attempt_id: int) -> list[AttemptAnswer]:
        res = await self.db.execute(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
        )
        return list(res.scalars().all())

    async def list_attempts_for_olympiad_with_users(self, olympiad_id: int):
        stmt = (
            select(Attempt, User)
            .join(User, User.id == Attempt.user_id)
            .where(Attempt.olympiad_id == olympiad_id)
            .order_by(Attempt.id.desc())
        )
        res = await self.db.execute(stmt)
        return res.all()  # list[tuple[Attempt, User]]
