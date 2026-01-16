"""add gender and subscription to users

Revision ID: f7d2c3a4b5e6
Revises: e1f4a2b7c9d0
Create Date: 2026-02-01 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f7d2c3a4b5e6"
down_revision = "e1f4a2b7c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    gender_enum = sa.Enum("муж", "жен", name="gender")
    gender_enum.create(op.get_bind(), checkfirst=True)
    op.add_column("users", sa.Column("gender", gender_enum, nullable=True))
    op.add_column("users", sa.Column("subscription", sa.Integer(), nullable=False, server_default="0"))
    op.execute("UPDATE users SET subscription = 0 WHERE subscription IS NULL")
    op.alter_column("users", "subscription", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "subscription")
    op.drop_column("users", "gender")
    gender_enum = sa.Enum("муж", "жен", name="gender")
    gender_enum.drop(op.get_bind(), checkfirst=True)
