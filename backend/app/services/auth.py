from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.models.user import UserRole
from app.repos.users import UsersRepo


class AuthService:
    def __init__(self, users_repo: UsersRepo):
        self.users_repo = users_repo

    async def register(
        self,
        login: str,
        password: str,
        role: str,
        email: str,
        *,
        surname: str,
        name: str,
        father_name: str | None,
        country: str,
        city: str,
        school: str,
        class_grade: int | None,
        subject: str | None,
    ):
        existing = await self.users_repo.get_by_login(login)
        if existing:
            raise ValueError("login_taken")

        existing_email = await self.users_repo.get_by_email(email)
        if existing_email:
            raise ValueError("email_taken")

        try:
            role_enum = UserRole(role)
        except Exception:
            raise ValueError("invalid_role")

        if role_enum not in (UserRole.student, UserRole.teacher):
            raise ValueError("invalid_role")

        if role_enum == UserRole.student:
            if class_grade is None:
                raise ValueError("class_grade_required")
            if subject is not None:
                raise ValueError("subject_not_allowed_for_student")
        if role_enum == UserRole.teacher:
            if subject is None:
                raise ValueError("subject_required")
            if class_grade is not None:
                raise ValueError("class_grade_not_allowed_for_teacher")

        password_hash = hash_password(password)
        user = await self.users_repo.create(
            login=login,
            email=email,
            password_hash=password_hash,
            role=role_enum,
            surname=surname,
            name=name,
            father_name=father_name,
            country=country,
            city=city,
            school=school,
            class_grade=class_grade,
            subject=subject,
        )
        return user

    async def login(self, login: str, password: str):
        user = await self.users_repo.get_by_login(login)
        if not user or not user.is_active:
            raise ValueError("invalid_credentials")

        if not verify_password(password, user.password_hash):
            raise ValueError("invalid_credentials")

        access = create_access_token(str(user.id))
        refresh = create_refresh_token(str(user.id))
        return access, refresh
