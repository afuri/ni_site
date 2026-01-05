from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine, text

from app.core.config import settings


def _sync_url(url: str) -> str:
    return url.replace("+asyncpg", "+psycopg2")


def main() -> int:
    if settings.ENV not in {"dev", "stage"}:
        print("db_reset_forbidden:ENV must be dev or stage", file=sys.stderr)
        return 1
    db_url = os.getenv("ALEMBIC_DATABASE_URL") or settings.DATABASE_URL
    if not db_url:
        print("missing DATABASE_URL", file=sys.stderr)
        return 2
    engine = create_engine(_sync_url(db_url))
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()
    print("db_reset_done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
