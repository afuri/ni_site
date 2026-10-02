"""Record the server-side finish time of new attempts.

Historical rows stay null because graded_at may include queue latency.
"""
from alembic import op
import sqlalchemy as sa


revision = "e8f9a0b1c2d3"
down_revision = "d7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("attempts", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("attempts", "finished_at")
