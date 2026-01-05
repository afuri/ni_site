"""Add temp_password_expires_at to users."""

from alembic import op
import sqlalchemy as sa


revision = "7c1b9a2d4f6e"
down_revision = "9f3c2d1a4e6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("temp_password_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "temp_password_expires_at")
