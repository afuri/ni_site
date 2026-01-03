"""Add refresh tokens table.

Revision ID: 4c8a0c4b1d2e
Revises: 2b1f4c7d8e9f
Create Date: 2025-01-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4c8a0c4b1d2e"
down_revision = "2b1f4c7d8e9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_refresh_tokens_user_expires", "refresh_tokens", ["user_id", "expires_at"])
    op.create_unique_constraint("uq_refresh_tokens_user_token", "refresh_tokens", ["user_id", "token_hash"])


def downgrade() -> None:
    op.drop_constraint("uq_refresh_tokens_user_token", "refresh_tokens", type_="unique")
    op.drop_index("ix_refresh_tokens_user_expires", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
