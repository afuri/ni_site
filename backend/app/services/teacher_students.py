from app.models.user import User, UserRole
from app.repos.users import UsersRepo
from app.repos.auth_tokens import AuthTokensRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.services.auth import AuthService
from app.models.teacher_student import TeacherStudentStatus, TeacherStudentRequestedBy
from app.core import error_codes as codes





class TeacherStudentsService:
    def __init__(self, users_repo: UsersRepo, links_repo: TeacherStudentsRepo):
        self.users_repo = users_repo
        self.links_repo = links_repo
        self.auth = AuthService(users_repo, AuthTokensRepo(users_repo.db))

    async def attach_existing(self, *, teacher: User, student_login: str):
        student = await self.users_repo.get_by_login(student_login)
        if not student:
            raise ValueError(codes.STUDENT_NOT_FOUND)

        if student.id == teacher.id:
            raise ValueError(codes.CANNOT_ATTACH_SELF)

        if student.role != UserRole.student:
            raise ValueError(codes.NOT_A_STUDENT)

        existing = await self.links_repo.get_link(teacher.id, student.id)
        if existing:
            return existing

        link = await self.links_repo.create_link(
            teacher.id,
            student.id,
            TeacherStudentRequestedBy.teacher,
        )
        return link

    async def create_and_attach(self, *, teacher: User, payload: dict):
        # создаём студента через AuthService.register (оно проверит login_taken)
        login = payload["login"]
        password = payload["password"]

        # роль строго student
        user = await self.auth.register(
            login=login,
            password=password,
            role="student",
            email=payload["email"],
            surname=payload["surname"],
            name=payload["name"],
            father_name=payload.get("father_name"),
            country=payload["country"],
            city=payload["city"],
            school=payload["school"],
            class_grade=payload["class_grade"],
            subject=None,
            gender=payload["gender"],
            subscription=payload.get("subscription", 0),
        )

        link = await self.links_repo.create_link(
            teacher.id,
            user.id,
            TeacherStudentRequestedBy.teacher,
        )
        return link, user

    async def confirm(self, *, teacher: User, student_id: int):
        link = await self.links_repo.get_link(teacher.id, student_id)
        if not link:
            raise ValueError(codes.LINK_NOT_FOUND)
        if link.requested_by != TeacherStudentRequestedBy.student:
            raise ValueError(codes.FORBIDDEN)

        if link.status == TeacherStudentStatus.confirmed:
            return link

        return await self.links_repo.confirm_link(link)

    async def list(self, *, teacher: User, status):
        rows = await self.links_repo.list_links_with_users_for_teacher(teacher.id, status)
        result = []
        for link, teacher_user, student_user in rows:
            result.append(
                {
                    "id": link.id,
                    "teacher_id": link.teacher_id,
                    "student_id": link.student_id,
                    "status": link.status,
                    "requested_by": link.requested_by,
                    "created_at": link.created_at,
                    "confirmed_at": link.confirmed_at,
                    "teacher_surname": teacher_user.surname,
                    "teacher_name": teacher_user.name,
                    "teacher_father_name": teacher_user.father_name,
                    "teacher_subject": teacher_user.subject,
                    "student_surname": student_user.surname,
                    "student_name": student_user.name,
                    "student_father_name": student_user.father_name,
                    "student_class_grade": student_user.class_grade,
                }
            )
        return result

    async def remove(self, *, teacher: User, student_id: int) -> None:
        link = await self.links_repo.get_link(teacher.id, student_id)
        if not link:
            raise ValueError(codes.LINK_NOT_FOUND)
        await self.links_repo.delete_link(link)

    async def request_teacher(self, *, student: User, teacher_login: str | None, teacher_email: str | None):
        teacher = None
        if teacher_login:
            teacher = await self.users_repo.get_by_login(teacher_login)
        if teacher is None and teacher_email:
            teacher = await self.users_repo.get_by_email(teacher_email)
        if not teacher:
            raise ValueError(codes.USER_NOT_FOUND)
        if teacher.role != UserRole.teacher:
            raise ValueError(codes.USER_NOT_TEACHER)
        if teacher.id == student.id:
            raise ValueError(codes.CANNOT_ATTACH_SELF)

        existing = await self.links_repo.get_link(teacher.id, student.id)
        if existing:
            return existing

        return await self.links_repo.create_link(
            teacher.id,
            student.id,
            TeacherStudentRequestedBy.student,
        )

    async def confirm_by_student(self, *, student: User, teacher_id: int):
        link = await self.links_repo.get_link(teacher_id, student.id)
        if not link:
            raise ValueError(codes.LINK_NOT_FOUND)
        if link.requested_by != TeacherStudentRequestedBy.teacher:
            raise ValueError(codes.FORBIDDEN)
        if link.status == TeacherStudentStatus.confirmed:
            return link
        return await self.links_repo.confirm_link(link)

    async def list_for_student(self, *, student: User, status):
        rows = await self.links_repo.list_links_with_users_for_student(student.id, status)
        result = []
        for link, teacher_user, student_user in rows:
            result.append(
                {
                    "id": link.id,
                    "teacher_id": link.teacher_id,
                    "student_id": link.student_id,
                    "status": link.status,
                    "requested_by": link.requested_by,
                    "created_at": link.created_at,
                    "confirmed_at": link.confirmed_at,
                    "teacher_surname": teacher_user.surname,
                    "teacher_name": teacher_user.name,
                    "teacher_father_name": teacher_user.father_name,
                    "teacher_subject": teacher_user.subject,
                    "student_surname": student_user.surname,
                    "student_name": student_user.name,
                    "student_father_name": student_user.father_name,
                    "student_class_grade": student_user.class_grade,
                }
            )
        return result

    async def remove_by_student(self, *, student: User, teacher_id: int) -> None:
        link = await self.links_repo.get_link(teacher_id, student.id)
        if not link:
            raise ValueError(codes.LINK_NOT_FOUND)
        await self.links_repo.delete_link(link)

    async def get_student_profile(self, *, teacher: User, student_id: int) -> User:
        if teacher.role != UserRole.admin:
            link = await self.links_repo.get_link(teacher.id, student_id)
            if not link or link.status != TeacherStudentStatus.confirmed:
                raise ValueError(codes.FORBIDDEN)
        student = await self.users_repo.get_by_id(student_id)
        if not student:
            raise ValueError(codes.USER_NOT_FOUND)
        if student.role != UserRole.student:
            raise ValueError(codes.USER_NOT_FOUND)
        return student

    async def update_student_profile(self, *, teacher: User, student_id: int, data: dict) -> User:
        student = await self.get_student_profile(teacher=teacher, student_id=student_id)
        if student.role != UserRole.student:
            raise ValueError(codes.USER_NOT_FOUND)
        if "subject" in data:
            data.pop("subject", None)
        return await self.users_repo.update_profile(student, data)
