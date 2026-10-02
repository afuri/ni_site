"""Assign agreed fallback region to unresolved legacy geography.

Downgrade does not reconstruct the former region; restore it from the preflight
backup if rolling back the data decision. Legacy text is retained until contract.
"""
from alembic import op
import sqlalchemy as sa

revision = 'f3c4d5e6f7a8'
down_revision = 'e2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    targets = bind.execute(sa.text("""SELECT COUNT(*) FROM users WHERE role IN ('student', 'teacher') AND school_id IS NULL
        AND school_status IN ('missing', 'not_required')
        AND (NULLIF(BTRIM(city), '') IS NOT NULL OR NULLIF(BTRIM(school), '') IS NOT NULL)""")).scalar_one()
    if not targets:
        return
    other = bind.execute(sa.text('SELECT id FROM regions WHERE is_other AND is_active')).scalars().all()
    if len(other) != 1:
        raise RuntimeError('Expected exactly one active fallback region')
    bind.execute(sa.text("""UPDATE users SET region_id=:region_id
        WHERE role IN ('student', 'teacher') AND school_id IS NULL
        AND school_status IN ('missing', 'not_required')
        AND (NULLIF(BTRIM(city), '') IS NOT NULL OR NULLIF(BTRIM(school), '') IS NOT NULL)"""), {'region_id': other[0]})
    # Preserve grade 0, not_required, old text and every historical result.


def downgrade():
    pass  # Data decision: original region IDs are available in the backup only.
