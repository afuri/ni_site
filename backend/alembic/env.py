from logging.config import fileConfig
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
        metadata_tables = set(target_metadata.tables.keys())
        has_schema_tables = bool(tables & metadata_tables)
        if "alembic_version" in tables and not has_schema_tables:
            version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
            raise RuntimeError(
                f"Alembic preflight failed: alembic_version={version} but no app tables found. "
                "Drop alembic_version or reset the database before running migrations."
            )
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()
        # Make sure DDL changes are committed.
        connection.commit()

        # Connection closes here.


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
