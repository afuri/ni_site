"""admin task bank tasks table

Revision ID: 1c6955f81daf
Revises: a2a6ce0533a7
Create Date: 2026-01-01 22:40:23.950454

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1c6955f81daf'
down_revision: Union[str, None] = 'a2a6ce0533a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject", sa.Enum("math", "cs", name="subject"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("task_type", sa.Enum("single_choice", "multi_choice", "short_text", name="tasktype"), nullable=False),
        sa.Column("image_key", sa.String(length=2048), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(op.f("ix_tasks_subject"), "tasks", ["subject"], unique=False)
    op.create_index(op.f("ix_tasks_task_type"), "tasks", ["task_type"], unique=False)
    op.create_index(op.f("ix_tasks_created_by_user_id"), "tasks", ["created_by_user_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_tasks_created_by_user_id"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_task_type"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_subject"), table_name="tasks")
    op.drop_table("tasks")
    op.execute("DROP TYPE IF EXISTS tasktype")
    op.execute("DROP TYPE IF EXISTS subject")

