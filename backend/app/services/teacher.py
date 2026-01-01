from app.models.user import User, UserRole
from app.repos.olympiads import OlympiadsRepo
from app.repos.teacher import TeacherRepo


class TeacherService:
    def __init__(self, teacher_repo: TeacherRepo, olymp_repo: OlympiadsRepo):
        self.teacher_repo = teacher_repo
        self.olymp_repo = olymp_repo

    async def _ensure_teacher_access_to_olympiad(self, *, teacher: User, olympiad_id: int):
        olympiad = await self.olymp_repo.get_by_id(olympiad_id)
        if not olympiad:
            raise ValueError("olympiad_not_found")
        if teacher.role != UserRole.admin and olympiad.created_by_user_id != teacher.id:
            raise ValueError("forbidden")
        return olympiad

    async def get_attempt_view(self, *, teacher: User, attempt_id: int):
        pair = await self.teacher_repo.get_attempt_with_user(attempt_id)
        if not pair:
            raise ValueError("attempt_not_found")
        attempt, user = pair

        olympiad = await self._ensure_teacher_access_to_olympiad(teacher=teacher, olympiad_id=attempt.olympiad_id)

        tasks = await self.teacher_repo.list_tasks(attempt.olympiad_id)
        answers = await self.teacher_repo.list_answers(attempt.id)
        answers_by_task = {a.task_id: a for a in answers}

        return attempt, user, olympiad, tasks, answers_by_task

    async def list_olympiad_attempts(self, *, teacher: User, olympiad_id: int):
        olympiad = await self._ensure_teacher_access_to_olympiad(teacher=teacher, olympiad_id=olympiad_id)
        rows = await self.teacher_repo.list_attempts_for_olympiad_with_users(olympiad_id)
        return olympiad, rows
