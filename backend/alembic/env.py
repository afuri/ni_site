from logging.config import fileConfig
import logging
import sys
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

from sqlalchemy import engine_from_config, inspect, text
from sqlalchemy import pool

from alembic import context

from app.db.base import Base
from app.models.user import User  # noqa
from app.models.olympiad import Olympiad  # noqa
from app.models.olympiad_task import OlympiadTask  # noqa
from app.models.attempt import Attempt, AttemptAnswer, AttemptTaskGrade  # noqa
from app.models.auth_token import EmailVerification, PasswordResetToken, RefreshToken  # noqa
from app.models.audit_log import AuditLog  # noqa
from app.core.config import settings
from app.models.social_account import SocialAccount  # noqa
from app.models.content import ContentItem  # noqa

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
logger = logging.getLogger("alembic")

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# Override sqlalchemy.url with our database URL
# Convert asyncpg URL to psycopg2 for Alembic (Alembic needs sync driver)
# Use 127.0.0.1 instead of localhost to avoid IPv6 issues
if load_dotenv is not None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        load_dotenv(env_path)

database_url = (
    os.getenv("ALEMBIC_DATABASE_URL")
    or os.getenv("DATABASE_URL")
    or settings.DATABASE_URL
)
database_url = database_url.replace("+asyncpg", "+psycopg2").replace("localhost", "127.0.0.1")
config.set_main_option("sqlalchemy.url", database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    logger.info("alembic offline mode, url=%s", url)
    print(f"alembic offline mode, url={url}", file=sys.stderr)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    logger.info("alembic online mode, url=%s", config.get_main_option("sqlalchemy.url"))
    print(f"alembic online mode, url={config.get_main_option('sqlalchemy.url')}", file=sys.stderr)
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Ensure search_path is set outside the migration transaction.
        connection.exec_driver_sql("SET search_path TO public")
        connection.commit()
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        if "alembic_version" in tables and len(tables) == 1:
            version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            raise RuntimeError(
                f"Alembic preflight failed: alembic_version={version} but no schema tables found. "
                "Drop alembic_version or reset the database before running migrations."
            )
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()
        # Make sure DDL changes are committed.
        connection.commit()

        try:
            table_rows = connection.execute(
                text(
                    """
                    select table_schema, table_name
                    from information_schema.tables
                    where table_schema not in ('pg_catalog','information_schema')
                    order by 1,2
                    """
                )
            ).fetchall()
            logger.info("alembic tables after migrations: %s", table_rows)
            print(f"alembic tables after migrations: {table_rows}", file=sys.stderr)
            version_row = connection.execute(
                text("select version_num from alembic_version")
            ).fetchall()
            logger.info("alembic version rows: %s", version_row)
            print(f"alembic version rows: {version_row}", file=sys.stderr)
        except Exception as exc:
            logger.info("alembic post-migration check failed: %s", exc)
            print(f"alembic post-migration check failed: {exc}", file=sys.stderr)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
