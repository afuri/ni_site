"""Olympiad repository."""
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.olympiad import Olympiad, OlympiadTask


class OlympiadsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_olympiad(self, *, title: str, description: str, duration_sec: int, created_by_user_id: int) -> Olympiad:
        obj = Olympiad(
            title=title,
            description=description,
            duration_sec=duration_sec,
            created_by_user_id=created_by_user_id,
            is_published=False,
        )
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def get_by_id(self, olympiad_id: int) -> Olympiad | None:
        res = await self.db.execute(select(Olympiad).where(Olympiad.id == olympiad_id))
        return res.scalar_one_or_none()

    async def list_published(self) -> list[Olympiad]:
        res = await self.db.execute(select(Olympiad).where(Olympiad.is_published == True).order_by(Olympiad.id.desc()))
        return list(res.scalars().all())

    async def publish(self, olympiad_id: int) -> None:
        await self.db.execute(
            update(Olympiad).where(Olympiad.id == olympiad_id).values(is_published=True)
        )
        await self.db.commit()

    async def add_task(self, *, olympiad_id: int, prompt: str, answer_max_len: int, sort_order: int) -> OlympiadTask:
        task = OlympiadTask(
            olympiad_id=olympiad_id,
            prompt=prompt,
            answer_max_len=answer_max_len,
            sort_order=sort_order,
        )
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def list_tasks(self, olympiad_id: int) -> list[OlympiadTask]:
        res = await self.db.execute(
            select(OlympiadTask)
            .where(OlympiadTask.olympiad_id == olympiad_id)
            .order_by(OlympiadTask.sort_order.asc(), OlympiadTask.id.asc())
        )
        return list(res.scalars().all())
