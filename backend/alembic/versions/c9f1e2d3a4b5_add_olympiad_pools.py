"""add olympiad pools

Revision ID: c9f1e2d3a4b5
Revises: a1b2c3d4e5f7, b2c3d4e5f6a7
Create Date: 2026-01-31 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c9f1e2d3a4b5"
down_revision: Union[str, Sequence[str], None] = ("a1b2c3d4e5f7", "b2c3d4e5f6a7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "olympiad_pools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject", sa.String(length=32), nullable=False),
        sa.Column("grade_group", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_olympiad_pools_subject", "olympiad_pools", ["subject"])
    op.create_index("ix_olympiad_pools_grade_group", "olympiad_pools", ["grade_group"])
    op.create_index("ix_olympiad_pools_is_active", "olympiad_pools", ["is_active"])

    op.create_table(
        "olympiad_pool_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pool_id", sa.Integer(), nullable=False),
        sa.Column("olympiad_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["pool_id"], ["olympiad_pools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["olympiad_id"], ["olympiads.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("pool_id", "olympiad_id", name="uq_olympiad_pool_item"),
        sa.UniqueConstraint("pool_id", "position", name="uq_olympiad_pool_position"),
    )
    op.create_index("ix_olympiad_pool_items_pool_id", "olympiad_pool_items", ["pool_id"])
    op.create_index("ix_olympiad_pool_items_olympiad_id", "olympiad_pool_items", ["olympiad_id"])

    op.create_table(
        "olympiad_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("pool_id", sa.Integer(), nullable=False),
        sa.Column("olympiad_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pool_id"], ["olympiad_pools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["olympiad_id"], ["olympiads.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "pool_id", name="uq_olympiad_assignment"),
    )
    op.create_index("ix_olympiad_assignments_user_id", "olympiad_assignments", ["user_id"])
    op.create_index("ix_olympiad_assignments_pool_id", "olympiad_assignments", ["pool_id"])
    op.create_index("ix_olympiad_assignments_olympiad_id", "olympiad_assignments", ["olympiad_id"])


def downgrade() -> None:
    op.drop_index("ix_olympiad_assignments_olympiad_id", table_name="olympiad_assignments")
    op.drop_index("ix_olympiad_assignments_pool_id", table_name="olympiad_assignments")
    op.drop_index("ix_olympiad_assignments_user_id", table_name="olympiad_assignments")
    op.drop_table("olympiad_assignments")

    op.drop_index("ix_olympiad_pool_items_olympiad_id", table_name="olympiad_pool_items")
    op.drop_index("ix_olympiad_pool_items_pool_id", table_name="olympiad_pool_items")
    op.drop_table("olympiad_pool_items")

    op.drop_index("ix_olympiad_pools_is_active", table_name="olympiad_pools")
    op.drop_index("ix_olympiad_pools_grade_group", table_name="olympiad_pools")
    op.drop_index("ix_olympiad_pools_subject", table_name="olympiad_pools")
    op.drop_table("olympiad_pools")
