"""teacher students pending confirmed

Revision ID: a2a6ce0533a7
Revises: 596a1c1510c7
Create Date: 2026-01-01 22:05:04.064925

"""
from alembic import op
import sqlalchemy as sa


revision = "a2a6ce0533a7"
down_revision = "596a1c1510c7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "teacher_students",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("teacher_id", "student_id", name="uq_teacher_student"),
    )
    op.create_index("ix_teacher_students_teacher_status", "teacher_students", ["teacher_id", "status"], unique=False)
    op.create_index(op.f("ix_teacher_students_teacher_id"), "teacher_students", ["teacher_id"], unique=False)
    op.create_index(op.f("ix_teacher_students_student_id"), "teacher_students", ["student_id"], unique=False)
    op.create_index(op.f("ix_teacher_students_status"), "teacher_students", ["status"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_teacher_students_status"), table_name="teacher_students")
    op.drop_index(op.f("ix_teacher_students_student_id"), table_name="teacher_students")
    op.drop_index(op.f("ix_teacher_students_teacher_id"), table_name="teacher_students")
    op.drop_index("ix_teacher_students_teacher_status", table_name="teacher_students")
    op.drop_table("teacher_students")
