from app.models.teacher_student import TeacherStudentStatus
from app.models.user import User, UserRole
from app.repos.olympiads import OlympiadsRepo
from app.repos.teacher import TeacherRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.core import error_codes as codes


class TeacherService:
    def __init__(self, teacher_repo: TeacherRepo, olymp_repo: OlympiadsRepo, links_repo: TeacherStudentsRepo):
        self.teacher_repo = teacher_repo
        self.olymp_repo = olymp_repo
        self.links_repo = links_repo

    async def _ensure_olympiad(self, *, olympiad_id: int):
        olympiad = await self.olymp_repo.get(olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        return olympiad

    async def get_attempt_view(self, *, teacher: User, attempt_id: int):
        pair = await self.teacher_repo.get_attempt_with_user(attempt_id)
        if not pair:
            raise ValueError(codes.ATTEMPT_NOT_FOUND)
        attempt, user = pair

        olympiad = await self._ensure_olympiad(olympiad_id=attempt.olympiad_id)
        if teacher.role != UserRole.admin:
            link = await self.links_repo.get_link(teacher.id, user.id)
            if not link or link.status != TeacherStudentStatus.confirmed:
                raise ValueError(codes.FORBIDDEN)

        tasks = await self.teacher_repo.list_tasks(attempt.olympiad_id)
        answers = await self.teacher_repo.list_answers(attempt.id)
        answers_by_task = {a.task_id: a for a in answers}

        return attempt, user, olympiad, tasks, answers_by_task

    async def list_olympiad_attempts(self, *, teacher: User, olympiad_id: int):
        olympiad = await self._ensure_olympiad(olympiad_id=olympiad_id)
        if teacher.role == UserRole.admin:
            rows = await self.teacher_repo.list_attempts_for_olympiad_with_users(olympiad_id)
        else:
            rows = await self.teacher_repo.list_attempts_for_olympiad_with_users_for_teacher(olympiad_id, teacher.id)
        return olympiad, rows
