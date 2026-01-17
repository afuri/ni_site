from __future__ import annotations

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text, inspect

from app.core.config import settings
from app.db.base import Base
import app.models.user  # noqa: F401
import app.models.task  # noqa: F401
import app.models.olympiad  # noqa: F401
import app.models.olympiad_task  # noqa: F401
import app.models.attempt  # noqa: F401
import app.models.teacher_student  # noqa: F401
import app.models.social_account  # noqa: F401
import app.models.auth_token  # noqa: F401
import app.models.audit_log  # noqa: F401
import app.models.content  # noqa: F401
import app.models.user_change  # noqa: F401
import app.models.school  # noqa: F401


def _sync_url(url: str) -> str:
    return url.replace("+asyncpg", "+psycopg2")


def _should_reset() -> bool:
    return settings.ENV in {"dev", "stage"}


def main() -> int:
    db_url = os.getenv("ALEMBIC_DATABASE_URL") or settings.DATABASE_URL
    if not db_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1

    engine = create_engine(_sync_url(db_url))
    metadata_tables = set(Base.metadata.tables.keys())
    with engine.connect() as conn:
        inspector = inspect(conn)
        tables = set(inspector.get_table_names(schema="public"))
        has_app_tables = bool(tables & metadata_tables)
        if not has_app_tables:
            if _should_reset():
                conn.execute(text("DROP SCHEMA public CASCADE"))
                conn.execute(text("CREATE SCHEMA public"))
                conn.commit()
            else:
                print(
                    "Schema has no app tables; refusing to reset in prod. "
                    "Set ENV=dev|stage or reset manually.",
                    file=sys.stderr,
                )
                return 2

    project_root = Path(__file__).resolve().parents[1]
    alembic_ini = project_root / "alembic.ini"
    alembic_dir = project_root / "alembic"
    if not alembic_dir.exists():
        print(f"Alembic directory not found: {alembic_dir}", file=sys.stderr)
        return 3
    config = Config(str(alembic_ini))
    config.set_main_option("sqlalchemy.url", _sync_url(db_url))
    config.set_main_option("script_location", str(alembic_dir))
    command.upgrade(config, "head")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
