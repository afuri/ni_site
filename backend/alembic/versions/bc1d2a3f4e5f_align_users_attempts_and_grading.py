"""align users, attempts, and grading

Revision ID: bc1d2a3f4e5f
Revises: a7cfcfe408de
Create Date: 2026-01-02 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "bc1d2a3f4e5f"
down_revision: Union[str, None] = "a7cfcfe408de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users
    op.add_column("users", sa.Column("country", sa.String(length=120), nullable=True))
    op.execute("UPDATE users SET email = CONCAT('legacy_', id, '@example.invalid') WHERE email IS NULL")
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=False)
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.drop_column("users", "teacher_math")
    op.drop_column("users", "teacher_cs")
    op.drop_column("users", "teacher_math_link")
    op.drop_column("users", "teacher_cs_link")

    # attempts
    op.add_column("attempts", sa.Column("score_total", sa.Integer(), server_default="0", nullable=False))
    op.add_column("attempts", sa.Column("score_max", sa.Integer(), server_default="0", nullable=False))
    op.add_column("attempts", sa.Column("passed", sa.Boolean(), nullable=True))
    op.add_column("attempts", sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True))

    # attempt_answers: move to payload + task FK
    op.add_column("attempt_answers", sa.Column("answer_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.execute("UPDATE attempt_answers SET answer_payload = jsonb_build_object('text', answer_text) WHERE answer_payload IS NULL")
    op.alter_column("attempt_answers", "answer_payload", nullable=False)
    op.execute("ALTER TABLE attempt_answers DROP CONSTRAINT IF EXISTS attempt_answers_task_id_fkey")
    op.execute(
        "UPDATE attempt_answers aa "
        "SET task_id = ot.task_id "
        "FROM olympiad_tasks ot "
        "WHERE aa.task_id = ot.id"
    )
    op.create_foreign_key(
        "attempt_answers_task_id_fkey",
        "attempt_answers",
        "tasks",
        ["task_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_column("attempt_answers", "answer_text")

    op.create_table(
        "attempt_task_grades",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attempt_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("max_score", sa.Integer(), nullable=False),
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["attempt_id"], ["attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", "task_id", name="uq_attempt_task_grade"),
    )


def downgrade() -> None:
    op.drop_table("attempt_task_grades")

    op.add_column("attempt_answers", sa.Column("answer_text", sa.Text(), nullable=False))
    op.execute("UPDATE attempt_answers SET answer_text = COALESCE(answer_payload->>'text', '')")
    op.execute("ALTER TABLE attempt_answers DROP CONSTRAINT IF EXISTS attempt_answers_task_id_fkey")
    op.execute(
        "UPDATE attempt_answers aa "
        "SET task_id = ot.id "
        "FROM olympiad_tasks ot "
        "WHERE aa.task_id = ot.task_id"
    )
    op.create_foreign_key(
        "attempt_answers_task_id_fkey",
        "attempt_answers",
        "olympiad_tasks",
        ["task_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_column("attempt_answers", "answer_payload")

    op.drop_column("attempts", "graded_at")
    op.drop_column("attempts", "passed")
    op.drop_column("attempts", "score_max")
    op.drop_column("attempts", "score_total")

    op.add_column("users", sa.Column("teacher_cs_link", sa.String(length=2048), nullable=True))
    op.add_column("users", sa.Column("teacher_math_link", sa.String(length=2048), nullable=True))
    op.add_column("users", sa.Column("teacher_cs", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("teacher_math", sa.String(length=255), nullable=True))
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=True)
    op.drop_column("users", "country")
