import asyncio
import random
import sys
from pathlib import Path

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.repos.users import UsersRepo


PASSWORD = "StrongPass1"
COMMON_PROFILE = {
    "surname": "Иванов",
    "name": "Иван",
    "father_name": "Иванович",
    "country": "Россия",
    "city": "Москва",
    "school": "School 344",
}

USERS = [
    {
        "login": "student01",
        "email": "student01@example.com",
        "role": UserRole.student,
        "class_grade": 7,
        "subject": None,
    },
    {
        "login": "student02",
        "email": "student02@example.com",
        "role": UserRole.student,
        "class_grade": 8,
        "subject": None,
    },
    {
        "login": "student03",
        "email": "student03@example.com",
        "role": UserRole.student,
        "class_grade": 9,
        "subject": None,
    },
    {
        "login": "teacher01",
        "email": "teacher01@example.com",
        "role": UserRole.teacher,
        "class_grade": None,
        "subject": "Math",
    },
    {
        "login": "teacher02",
        "email": "teacher02@example.com",
        "role": UserRole.teacher,
        "class_grade": None,
        "subject": "Informatics",
    },
    {
        "login": "teacher03",
        "email": "teacher03@example.com",
        "role": UserRole.teacher,
        "class_grade": None,
        "subject": "Logic",
    },
]


async def _create_user(repo: UsersRepo, payload: dict) -> bool:
    existing = await repo.get_by_login(payload["login"])
    if existing:
        print(f"skip:{payload['login']}")
        return False
    password_hash = hash_password(PASSWORD)
    await repo.create(
        login=payload["login"],
        email=payload["email"],
        password_hash=password_hash,
        role=payload["role"],
        is_email_verified=True,
        surname=COMMON_PROFILE["surname"],
        name=COMMON_PROFILE["name"],
        father_name=COMMON_PROFILE["father_name"],
        country=COMMON_PROFILE["country"],
        city=COMMON_PROFILE["city"],
        school=COMMON_PROFILE["school"],
        class_grade=payload["class_grade"],
        subject=payload["subject"],
        gender=random.choice(["male", "female"]),
        subscription=0,
    )
    print(f"created:{payload['login']}")
    return True


async def run() -> None:
    async with SessionLocal() as session:
        res = await session.execute(select(User.id))
        _ = res.all()
        repo = UsersRepo(session)
        created = 0
        for payload in USERS:
            if await _create_user(repo, payload):
                created += 1
        print(f"done:{created}")


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as exc:
        print(f"error:{exc}", file=sys.stderr)
        sys.exit(1)
