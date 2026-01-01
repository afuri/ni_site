from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.teacher_student import TeacherStudent, TeacherStudentStatus


class TeacherStudentsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_link(self, teacher_id: int, student_id: int) -> TeacherStudent | None:
        res = await self.db.execute(
            select(TeacherStudent).where(
                TeacherStudent.teacher_id == teacher_id,
                TeacherStudent.student_id == student_id,
            )
        )
        return res.scalar_one_or_none()

    async def create_link(self, teacher_id: int, student_id: int) -> TeacherStudent:
        link = TeacherStudent(
            teacher_id=teacher_id,
            student_id=student_id,
            status=TeacherStudentStatus.pending,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(link)
        await self.db.commit()
        await self.db.refresh(link)
        return link

    async def confirm_link(self, link: TeacherStudent) -> TeacherStudent:
        link.status = TeacherStudentStatus.confirmed
        link.confirmed_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(link)
        return link

    async def list_links(self, teacher_id: int, status: TeacherStudentStatus | None) -> list[TeacherStudent]:
        stmt = select(TeacherStudent).where(TeacherStudent.teacher_id == teacher_id)
        if status is not None:
            stmt = stmt.where(TeacherStudent.status == status)
        res = await self.db.execute(stmt.order_by(TeacherStudent.id.desc()))
        return list(res.scalars().all())
