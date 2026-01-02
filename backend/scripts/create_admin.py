import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.repos.users import UsersRepo


def _get_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"missing_env:{name}")
    return value


async def run() -> None:
    env_path = Path(__file__).resolve().parents[1] / "dot.env"
    if env_path.exists():
        load_dotenv(env_path)

    login = _get_env("ADMIN_LOGIN")
    email = _get_env("ADMIN_EMAIL")
    password = _get_env("ADMIN_PASSWORD")
    surname = _get_env("ADMIN_SURNAME")
    name = _get_env("ADMIN_NAME")
    country = _get_env("ADMIN_COUNTRY")
    city = _get_env("ADMIN_CITY")
    school = _get_env("ADMIN_SCHOOL")
    father_name = os.environ.get("ADMIN_FATHER_NAME")

    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.role == UserRole.admin))
        existing = res.scalar_one_or_none()
        if existing:
            print("admin_exists")
            return

        repo = UsersRepo(session)
        password_hash = hash_password(password)
        await repo.create(
            login=login,
            email=email,
            password_hash=password_hash,
            role=UserRole.admin,
            is_email_verified=True,
            surname=surname,
            name=name,
            father_name=father_name,
            country=country,
            city=city,
            school=school,
            class_grade=None,
            subject=None,
        )
        print("admin_created")


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
