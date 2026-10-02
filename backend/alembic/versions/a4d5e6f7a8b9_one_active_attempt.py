"""Enforce one active attempt; cutover requires all previous attempts terminal."""
from alembic import op
import sqlalchemy as sa

revision = 'a4d5e6f7a8b9'
down_revision = 'f3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    # Writers must be stopped; the lock closes the race even if one is overlooked.
    op.execute('LOCK TABLE attempts IN SHARE ROW EXCLUSIVE MODE')
    count = op.get_bind().execute(sa.text("SELECT COUNT(*) FROM attempts WHERE status='active'")).scalar_one()
    if count:
        raise RuntimeError(f'Cutover blocked: {count} active attempts; do not regrade history in migration')
    op.create_index('uq_attempt_one_active_user', 'attempts', ['user_id'], unique=True,
                    postgresql_where=sa.text("status = 'active'"))
    op.create_index('ix_attempt_active_deadline', 'attempts', ['deadline_at'],
                    postgresql_where=sa.text("status = 'active'"))


def downgrade():
    op.drop_index('ix_attempt_active_deadline', table_name='attempts')
    op.drop_index('uq_attempt_one_active_user', table_name='attempts')
