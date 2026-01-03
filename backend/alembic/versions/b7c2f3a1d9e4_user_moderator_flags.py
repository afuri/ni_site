"""Add moderator flags to users.

Revision ID: b7c2f3a1d9e4
Revises: 938c0a5e39b5
Create Date: 2025-01-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b7c2f3a1d9e4"
down_revision = "938c0a5e39b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_moderator", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("moderator_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "moderator_requested")
    op.drop_column("users", "is_moderator")
