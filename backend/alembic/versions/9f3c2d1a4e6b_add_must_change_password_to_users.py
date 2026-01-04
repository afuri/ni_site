"""Add must_change_password to users."""

from alembic import op
import sqlalchemy as sa


revision = "9f3c2d1a4e6b"
down_revision = "6f3a9a1e2b7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("users", "must_change_password", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
