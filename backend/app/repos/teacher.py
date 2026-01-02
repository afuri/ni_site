from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.olympiad import Olympiad
from app.models.olympiad_task import OlympiadTask
from app.models.attempt import Attempt, AttemptAnswer, AttemptTaskGrade
from app.models.teacher_student import TeacherStudent, TeacherStudentStatus
from app.models.task import Task


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

    async def list_tasks(self, olympiad_id: int) -> list[tuple[OlympiadTask, Task]]:
        res = await self.db.execute(
            select(OlympiadTask, Task)
            .join(Task, Task.id == OlympiadTask.task_id)
            .where(OlympiadTask.olympiad_id == olympiad_id)
            .order_by(OlympiadTask.sort_order.asc(), OlympiadTask.id.asc())
        )
        return list(res.all())

    async def list_answers(self, attempt_id: int) -> list[AttemptAnswer]:
        res = await self.db.execute(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
        )
        return list(res.scalars().all())

    async def list_grades(self, attempt_id: int) -> list[AttemptTaskGrade]:
        res = await self.db.execute(
            select(AttemptTaskGrade).where(AttemptTaskGrade.attempt_id == attempt_id)
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
