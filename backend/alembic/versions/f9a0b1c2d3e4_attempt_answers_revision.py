"""A single answer revision; do not backfill historical attempts."""
from alembic import op
import sqlalchemy as sa

revision = "f9a0b1c2d3e4"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().execute(sa.text("SELECT count(*) FROM attempts WHERE status='active'")).scalar():
        raise RuntimeError("Answer contract cutover requires no active attempts")
    op.add_column("attempts", sa.Column("answers_revision", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_attempts_answers_revision", "attempts",
                               "answers_revision IS NULL OR answers_revision >= 0")


def downgrade():
    op.drop_constraint("ck_attempts_answers_revision", "attempts", type_="check")
    op.drop_column("attempts", "answers_revision")
