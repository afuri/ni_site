"""Archive materials and permanently freeze used olympiad rules."""
from alembic import op
import sqlalchemy as sa

revision = 'e2b3c4d5e6f7'
down_revision = 'd1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_tasks_archived_at', 'tasks', ['archived_at'])
    op.add_column('olympiads', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_olympiads_archived_at', 'olympiads', ['archived_at'])
    op.add_column('olympiads', sa.Column('rules_locked_at', sa.DateTime(timezone=True), nullable=True))
    # No historical attempt, answer or grade is updated.
    op.execute("""UPDATE olympiads o SET rules_locked_at = CURRENT_TIMESTAMP
        WHERE is_published OR EXISTS (SELECT 1 FROM attempts a WHERE a.olympiad_id=o.id)
        OR EXISTS (SELECT 1 FROM olympiad_assignments a WHERE a.olympiad_id=o.id)""")


def downgrade():
    op.drop_column('olympiads', 'rules_locked_at')
    op.drop_index('ix_olympiads_archived_at', table_name='olympiads')
    op.drop_column('olympiads', 'archived_at')
    op.drop_index('ix_tasks_archived_at', table_name='tasks')
    op.drop_column('tasks', 'archived_at')
