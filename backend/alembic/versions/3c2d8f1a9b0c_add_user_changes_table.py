"""Add user_changes table."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "3c2d8f1a9b0c"
down_revision = "7c1b9a2d4f6e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_changes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("target_user_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_changes_actor_user_id", "user_changes", ["actor_user_id"])
    op.create_index("ix_user_changes_target_user_id", "user_changes", ["target_user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_changes_target_user_id", table_name="user_changes")
    op.drop_index("ix_user_changes_actor_user_id", table_name="user_changes")
    op.drop_table("user_changes")
