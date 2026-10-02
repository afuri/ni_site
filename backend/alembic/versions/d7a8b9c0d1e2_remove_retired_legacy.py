"""Contract legacy after fallback region migration and client transition.

Data downgrade requires restoration of the preflight backup.
"""
from alembic import op
import sqlalchemy as sa
revision = 'd7a8b9c0d1e2'
down_revision = 'c6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.execute(sa.text("SELECT COUNT(*) FROM attempts WHERE status='active'")).scalar_one():
        raise RuntimeError('Legacy contract requires stopped writers and no active attempts')
    columns = {c['name'] for c in sa.inspect(bind).get_columns('users')}
    for name in ['teacher_math','teacher_cs','teacher_math_link','teacher_cs_link']:
        if name in columns:
            if bind.execute(sa.text(f"SELECT COUNT(*) FROM users WHERE NULLIF(BTRIM({name}::text), '') IS NOT NULL")).scalar_one():
                raise RuntimeError(f'Legacy field {name} is not empty')
            op.drop_column('users',name)
    if bind.execute(sa.text('SELECT COUNT(*) FROM social_accounts')).scalar_one():
        raise RuntimeError('social_accounts is not empty; contract stopped')
    # Plain DROP/RESTRICT fails if an unexpected consumer still has an FK.
    op.drop_table('social_accounts')
    op.drop_table('schools_legacy')
    for name in ['country','city','school']:
        op.drop_column('users',name)


def downgrade():
    raise RuntimeError('Restore pre-contract backup to recover removed legacy data')
