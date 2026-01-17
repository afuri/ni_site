import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal
from app.models.olympiad import Olympiad, OlympiadScope
from app.models.content import ContentItem, ContentStatus, ContentType
from app.models.user import User, UserRole
from app.repos.olympiads import OlympiadsRepo
from app.repos.content import ContentRepo


OLYMPIAD_TITLE = "Демоверсия олимпиады"
NEWS_TITLE = "Демоверсия новости"
ARTICLE_TITLE = "Демоверсия статьи"
AUTHOR_LOGIN = "admin01"


async def get_admin(session) -> User:
    res = await session.execute(select(User).where(User.login == AUTHOR_LOGIN))
    admin = res.scalar_one_or_none()
    if not admin or admin.role != UserRole.admin:
        raise RuntimeError(f"User {AUTHOR_LOGIN} not found or not admin")
    return admin


async def create_demo_olympiad(repo: OlympiadsRepo, admin_id: int) -> None:
    res = await repo.db.execute(select(Olympiad).where(Olympiad.title == OLYMPIAD_TITLE))
    existing = res.scalar_one_or_none()
    if existing:
        print("skip:olympiad")
        return

    now = datetime.now(timezone.utc)
    obj = Olympiad(
        title=OLYMPIAD_TITLE,
        description="Демонстрационная олимпиада для тестирования платформы.",
        scope=OlympiadScope.global_,
        age_group="1-11",
        attempts_limit=1,
        duration_sec=30 * 60,
        available_from=now,
        available_to=now + timedelta(days=180),
        pass_percent=10,
        is_published=False,
        results_released=False,
        created_by_user_id=admin_id,
        created_at=now,
        updated_at=now,
    )
    await repo.create(obj)
    print("created:olympiad")


async def create_demo_content(repo: ContentRepo, admin_id: int, title: str, body: str, ctype: ContentType) -> None:
    res = await repo.db.execute(
        select(ContentItem).where(ContentItem.title == title, ContentItem.content_type == ctype)
    )
    existing = res.scalar_one_or_none()
    if existing:
        print(f"skip:{ctype.value}")
        return
    now = datetime.now(timezone.utc)
    item = ContentItem(
        content_type=ctype,
        status=ContentStatus.draft,
        title=title,
        body=body,
        image_keys=[],
        author_id=admin_id,
        created_at=now,
        updated_at=now,
    )
    await repo.create(item)
    print(f"created:{ctype.value}")


async def run() -> None:
    async with SessionLocal() as session:
        admin = await get_admin(session)
        olymp_repo = OlympiadsRepo(session)
        content_repo = ContentRepo(session)

        await create_demo_olympiad(olymp_repo, admin.id)
        await create_demo_content(
            content_repo,
            admin.id,
            NEWS_TITLE,
            "Демоверсия новости: платформа «Невский интеграл» готовит интерактивные олимпиады и личные кабинеты с дипломами.",
            ContentType.news,
        )
        await create_demo_content(
            content_repo,
            admin.id,
            ARTICLE_TITLE,
            "Демоверсия статьи: этот проект демонстрирует онлайн-олимпиады, удобную регистрацию учеников и учителей, а также выпуск дипломов после проверки результатов.",
            ContentType.article,
        )
        print("done")


if __name__ == "__main__":
    asyncio.run(run())
