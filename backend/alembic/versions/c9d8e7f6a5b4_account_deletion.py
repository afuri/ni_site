"""Account deletion requests and durable file cleanup queue."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c9d8e7f6a5b4"
down_revision = "b8e7c6d5a4f3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("account_deletion_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_account_deletion_requests_user_id", "account_deletion_requests", ["user_id"], unique=True)
    op.create_table("account_deletion_cleanup",
        sa.Column("user_id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("attempt_ids", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM account_deletion_cleanup)")):
        raise RuntimeError("Complete pending account file cleanup before downgrade")
    op.drop_table("account_deletion_cleanup")
    op.drop_table("account_deletion_requests")
