"""Temporary state for sequential ZIP task validation."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a8b3d5f7c901"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "task_upload_sessions",
        sa.Column("token", sa.String(36), primary_key=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("archive_sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('preparing', 'reviewing', 'completed', 'cancelled', 'failed')",
                           name="ck_task_upload_status"),
    )
    op.create_index("ix_task_upload_sessions_author_id", "task_upload_sessions", ["author_id"])
    op.create_index("ix_task_upload_sessions_expires_at", "task_upload_sessions", ["expires_at"])


def downgrade():
    op.drop_table("task_upload_sessions")
