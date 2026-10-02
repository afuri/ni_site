"""Separate trial format from subject without changing assignment IDs."""
from alembic import op
import sqlalchemy as sa

revision = 'b5e6f7a8b9c0'
down_revision = 'a4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('olympiad_pools', sa.Column('is_trial', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    bind = op.get_bind()
    for pool_id in bind.execute(sa.text("SELECT id FROM olympiad_pools WHERE subject='trial'")).scalars():
        subjects = bind.execute(sa.text('''SELECT DISTINCT t.subject::text FROM olympiad_pool_items i
            JOIN olympiad_tasks ot ON ot.olympiad_id=i.olympiad_id JOIN tasks t ON t.id=ot.task_id WHERE i.pool_id=:id'''), {'id':pool_id}).scalars().all()
        if len(subjects) != 1 or subjects[0] not in ('math', 'cs'):
            raise RuntimeError(f'Ambiguous trial subject for pool {pool_id}')
        bind.execute(sa.text('UPDATE olympiad_pools SET subject=:subject, is_trial=true WHERE id=:id'), {'id':pool_id,'subject':subjects[0]})
    op.create_check_constraint('ck_pool_subject', 'olympiad_pools', "subject IN ('math', 'cs')")
    op.create_check_constraint('ck_pool_position', 'olympiad_pool_items', 'position BETWEEN 1 AND 4')
    op.create_unique_constraint('uq_pool_variant', 'olympiad_pool_items', ['olympiad_id'])


def downgrade():
    op.drop_constraint('uq_pool_variant', 'olympiad_pool_items', type_='unique')
    op.drop_constraint('ck_pool_position', 'olympiad_pool_items', type_='check')
    op.drop_constraint('ck_pool_subject', 'olympiad_pools', type_='check')
    op.execute("UPDATE olympiad_pools SET subject='trial' WHERE is_trial")
    op.drop_column('olympiad_pools', 'is_trial')
