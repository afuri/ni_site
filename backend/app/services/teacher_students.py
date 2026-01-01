from app.models.user import User, UserRole
from app.repos.users import UsersRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.services.auth import AuthService
from app.models.teacher_student import TeacherStudentStatus





class TeacherStudentsService:
    def __init__(self, users_repo: UsersRepo, links_repo: TeacherStudentsRepo):
        self.users_repo = users_repo
        self.links_repo = links_repo
        self.auth = AuthService(users_repo)

    async def attach_existing(self, *, teacher: User, student_login: str):
        student = await self.users_repo.get_by_login(student_login)
        if not student:
            raise ValueError("student_not_found")

        if student.id == teacher.id:
            raise ValueError("cannot_attach_self")

        if student.role != UserRole.student:
            raise ValueError("not_a_student")

        existing = await self.links_repo.get_link(teacher.id, student.id)
        if existing:
            raise ValueError("already_attached")

        link = await self.links_repo.create_link(teacher.id, student.id)
        return link

    async def create_and_attach(self, *, teacher: User, payload: dict):
        # создаём студента через AuthService.register (оно проверит login_taken)
        login = payload["login"]
        password = payload["password"]

        # роль строго student
        user = await self.auth.register(login=login, password=password, role="student", email=None)

        # профиль — если передали
        profile_fields = {k: v for k, v in payload.items() if k not in ("login", "password") and v is not None}
        if profile_fields:
            await self.users_repo.update_profile(user, profile_fields)

        link = await self.links_repo.create_link(teacher.id, user.id)
        return link, user

    async def confirm(self, *, teacher: User, student_id: int):
        link = await self.links_repo.get_link(teacher.id, student_id)
        if not link:
            raise ValueError("link_not_found")

        if link.status == TeacherStudentStatus.confirmed:
            raise ValueError("already_confirmed")

        return await self.links_repo.confirm_link(link)

    async def list(self, *, teacher: User, status):
        return await self.links_repo.list_links(teacher.id, status)
