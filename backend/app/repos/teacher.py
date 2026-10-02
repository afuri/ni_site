from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.repos.attempts import AttemptsRepo
from app.repos.olympiad_tasks import OlympiadTasksRepo

from app.models.user import User
from app.models.olympiad import Olympiad
from app.models.attempt import Attempt
from app.models.teacher_student import TeacherStudent, TeacherStudentStatus


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

    async def list_tasks(self, olympiad_id: int):
        return await OlympiadTasksRepo(self.db).list_full_by_olympiad(olympiad_id)

    async def list_answers(self, attempt_id: int):
        return await AttemptsRepo(self.db).list_answers(attempt_id)

    async def list_grades(self, attempt_id: int):
        return await AttemptsRepo(self.db).list_grades(attempt_id)

    async def list_attempts_for_olympiad_with_users(self, olympiad_id: int, limit: int | None = None, offset: int = 0):
        stmt = (
            select(Attempt, User)
            .join(User, User.id == Attempt.user_id)
            .where(Attempt.olympiad_id == olympiad_id)
            .order_by(Attempt.id.desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return res.all()  # list[tuple[Attempt, User]]

    async def list_attempts_for_olympiad_with_users_for_teacher(self, olympiad_id: int, teacher_id: int):
        stmt = (
            select(Attempt, User)
            .join(User, User.id == Attempt.user_id)
            .join(TeacherStudent, TeacherStudent.student_id == User.id)
            .where(
                Attempt.olympiad_id == olympiad_id,
                TeacherStudent.teacher_id == teacher_id,
                TeacherStudent.status == TeacherStudentStatus.confirmed,
            )
            .order_by(Attempt.id.desc())
        )
        res = await self.db.execute(stmt)
        return res.all()
