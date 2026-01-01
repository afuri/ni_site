"""Olympiads service."""
from app.repos.olympiads import OlympiadsRepo
from app.models.user import User


class OlympiadsService:
    def __init__(self, repo: OlympiadsRepo):
        self.repo = repo

    async def create(self, *, user: User, title: str, description: str, duration_sec: int):
        # teacher-only проверяется на уровне роутера, здесь просто создаём
        return await self.repo.create_olympiad(
            title=title,
            description=description,
            duration_sec=duration_sec,
            created_by_user_id=user.id,
        )

    async def add_task(self, *, user: User, olympiad_id: int, prompt: str, answer_max_len: int, sort_order: int):
        olympiad = await self.repo.get_by_id(olympiad_id)
        if not olympiad:
            raise ValueError("not_found")

        if olympiad.created_by_user_id != user.id:
            raise ValueError("forbidden_owner")

        if olympiad.is_published:
            raise ValueError("already_published")

        return await self.repo.add_task(
            olympiad_id=olympiad_id,
            prompt=prompt,
            answer_max_len=answer_max_len,
            sort_order=sort_order,
        )

    async def publish(self, *, user: User, olympiad_id: int):
        olympiad = await self.repo.get_by_id(olympiad_id)
        if not olympiad:
            raise ValueError("not_found")

        if olympiad.created_by_user_id != user.id:
            raise ValueError("forbidden_owner")

        tasks = await self.repo.list_tasks(olympiad_id)
        if len(tasks) == 0:
            raise ValueError("no_tasks")

        if olympiad.is_published:
            return olympiad  # идемпотентно

        await self.repo.publish(olympiad_id)
        olympiad = await self.repo.get_by_id(olympiad_id)
        return olympiad

    async def get_with_tasks(self, olympiad_id: int):
        olympiad = await self.repo.get_by_id(olympiad_id)
        if not olympiad:
            raise ValueError("not_found")
        tasks = await self.repo.list_tasks(olympiad_id)
        return olympiad, tasks
