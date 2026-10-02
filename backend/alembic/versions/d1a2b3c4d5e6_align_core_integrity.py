"""Align core constraints without changing historical results."""
from alembic import op
import sqlalchemy as sa

revision = "d1a2b3c4d5e6"
down_revision = "c9d8e7f6a5b4"
branch_labels = None
depends_on = None

CHECKS = {
    "users": {"ck_users_class_grade": "class_grade IS NULL OR class_grade BETWEEN 0 AND 11"},
    "olympiads": {
        "ck_olympiads_duration": "duration_sec > 0",
        "ck_olympiads_window": "available_to > available_from",
        "ck_olympiads_pass_percent": "pass_percent BETWEEN 0 AND 100",
        "ck_olympiads_attempt_limit": "attempts_limit = 1",
    },
    "attempts": {
        "ck_attempts_time": "duration_sec > 0 AND deadline_at >= started_at",
        "ck_attempts_scores": "score_total >= 0 AND score_max >= 0 AND score_total <= score_max",
    },
    "attempt_task_grades": {"ck_attempt_task_grades_scores": "max_score > 0 AND score >= 0 AND score <= max_score"},
    "olympiad_tasks": {"ck_olympiad_tasks_rules": "max_score > 0 AND sort_order >= 0"},
}


def upgrade():
    # Some restored databases claim head while lacking these legacy FKs.
    inspector = sa.inspect(op.get_bind())
    for table in ("attempt_answers", "attempt_task_grades"):
        for fk in inspector.get_foreign_keys(table):
            if fk["constrained_columns"] == ["task_id"]:
                op.drop_constraint(fk["name"], table, type_="foreignkey")
        name = f"{table}_task_id_fkey"
        op.execute(sa.text(f"ALTER TABLE {table} ADD CONSTRAINT {name} FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT NOT VALID"))
        op.execute(sa.text(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}"))
    for table, name in (("tasks", "fk_tasks_author"), ("olympiad_pools", "fk_olympiad_pools_author")):
        if not any(fk["constrained_columns"] == ["created_by_user_id"] for fk in inspector.get_foreign_keys(table)):
            op.execute(sa.text(f"ALTER TABLE {table} ADD CONSTRAINT {name} FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID"))
            op.execute(sa.text(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}"))
    for table, checks in CHECKS.items():
        for name, expression in checks.items():
            op.execute(sa.text(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({expression}) NOT VALID"))
            op.execute(sa.text(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}"))


def downgrade():
    for table, checks in reversed(list(CHECKS.items())):
        for name in checks:
            op.drop_constraint(name, table, type_="check")
    for table, name in (("tasks", "fk_tasks_author"), ("olympiad_pools", "fk_olympiad_pools_author")):
        op.drop_constraint(name, table, type_="foreignkey")
    for table in ("attempt_answers", "attempt_task_grades"):
        name = f"{table}_task_id_fkey"
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, "tasks", ["task_id"], ["id"], ondelete="CASCADE")
