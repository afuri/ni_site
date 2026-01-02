"""admin olympiad builder

Revision ID: a5c725df7d30
Revises: 1c6955f81daf
Create Date: 2026-01-02 09:23:01.184985

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a5c725df7d30"
down_revision = "1c6955f81daf"
branch_labels = None
depends_on = None


def upgrade():
    # enums
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'olympiadscope') THEN CREATE TYPE olympiadscope AS ENUM ('global'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agegroup') THEN CREATE TYPE agegroup AS ENUM ('1','2','3-4','5-6','7-8'); END IF; END $$;")

    # olympiads adjustments / new columns (guarded for reruns)
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS scope olympiadscope NOT NULL DEFAULT 'global'")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS age_group agegroup")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS attempts_limit INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS duration_sec INTEGER")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS available_to TIMESTAMPTZ")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS pass_percent INTEGER NOT NULL DEFAULT 60")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ")
    op.execute("ALTER TABLE olympiads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ")
    # description было в начальной схеме: приводим тип/nullable
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='olympiads' AND column_name='description') THEN ALTER TABLE olympiads ALTER COLUMN description TYPE VARCHAR(2000), ALTER COLUMN description DROP NOT NULL; END IF; END $$;")

    op.execute("CREATE INDEX IF NOT EXISTS ix_olympiads_is_published ON olympiads(is_published)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_olympiads_scope ON olympiads(scope)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_olympiads_age_group ON olympiads(age_group)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_olympiads_created_by_user_id ON olympiads(created_by_user_id)")

    # Backfill для существующих строк (чтобы не оставались NULL)
    op.execute("""
      UPDATE olympiads
      SET
        age_group = COALESCE(age_group, '7-8'),
        duration_sec = COALESCE(duration_sec, 1800),
        available_from = COALESCE(available_from, NOW()),
        available_to = COALESCE(available_to, NOW() + interval '30 days'),
        created_by_user_id = COALESCE(created_by_user_id, 1),
        created_at = COALESCE(created_at, NOW()),
        updated_at = COALESCE(updated_at, NOW())
    """)

    op.alter_column("olympiads", "age_group", nullable=False)
    op.alter_column("olympiads", "duration_sec", nullable=False)
    op.alter_column("olympiads", "available_from", nullable=False)
    op.alter_column("olympiads", "available_to", nullable=False)
    op.alter_column("olympiads", "created_by_user_id", nullable=False)
    op.alter_column("olympiads", "created_at", nullable=False)
    op.alter_column("olympiads", "updated_at", nullable=False)

    # olympiad_tasks table
    # recreate olympiad_tasks to new structure (drop old inline-content table if present)
    op.execute("DROP TABLE IF EXISTS olympiad_tasks CASCADE")
    op.create_table(
        "olympiad_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("olympiad_id", sa.Integer(), sa.ForeignKey("olympiads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_score", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("olympiad_id", "task_id", name="uq_olympiad_task"),
    )
    op.create_index("ix_olympiad_tasks_olympiad_sort", "olympiad_tasks", ["olympiad_id", "sort_order"], unique=False)
    op.create_index(op.f("ix_olympiad_tasks_olympiad_id"), "olympiad_tasks", ["olympiad_id"], unique=False)
    op.create_index(op.f("ix_olympiad_tasks_task_id"), "olympiad_tasks", ["task_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_olympiad_tasks_task_id"), table_name="olympiad_tasks")
    op.drop_index(op.f("ix_olympiad_tasks_olympiad_id"), table_name="olympiad_tasks")
    op.drop_index("ix_olympiad_tasks_olympiad_sort", table_name="olympiad_tasks")
    op.drop_table("olympiad_tasks")

    op.drop_index(op.f("ix_olympiads_created_by_user_id"), table_name="olympiads")
    op.drop_index(op.f("ix_olympiads_age_group"), table_name="olympiads")
    op.drop_index(op.f("ix_olympiads_scope"), table_name="olympiads")
    op.drop_index(op.f("ix_olympiads_is_published"), table_name="olympiads")

    op.drop_column("olympiads", "updated_at")
    op.drop_column("olympiads", "created_at")
    op.drop_column("olympiads", "created_by_user_id")
    op.drop_column("olympiads", "is_published")
    op.drop_column("olympiads", "pass_percent")
    op.drop_column("olympiads", "available_to")
    op.drop_column("olympiads", "available_from")
    op.drop_column("olympiads", "duration_sec")
    op.drop_column("olympiads", "attempts_limit")
    op.drop_column("olympiads", "age_group")
    op.drop_column("olympiads", "scope")
    op.drop_column("olympiads", "description")

    op.execute("DROP TYPE IF EXISTS agegroup")
    op.execute("DROP TYPE IF EXISTS olympiadscope")
