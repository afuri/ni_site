"""add requested_by to teacher_students

Revision ID: c1b2d3e4f5a6
Revises: 5a1c9b8d7e6f
Create Date: 2026-01-09
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1b2d3e4f5a6"
down_revision: Union[str, None] = "5a1c9b8d7e6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "teacher_students",
        sa.Column("requested_by", sa.String(length=20), nullable=False, server_default="teacher"),
    )
    op.create_index(
        "ix_teacher_students_requested_by",
        "teacher_students",
        ["requested_by"],
    )


def downgrade() -> None:
    op.drop_index("ix_teacher_students_requested_by", table_name="teacher_students")
    op.drop_column("teacher_students", "requested_by")
