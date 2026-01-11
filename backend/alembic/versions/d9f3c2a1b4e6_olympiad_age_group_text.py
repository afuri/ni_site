"""olympiad age_group as text

Revision ID: d9f3c2a1b4e6
Revises: 938c0a5e39b5
Create Date: 2026-01-11 22:10:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "d9f3c2a1b4e6"
down_revision = "938c0a5e39b5"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE olympiads ALTER COLUMN age_group TYPE VARCHAR(32) USING age_group::text")
    op.execute("DROP TYPE IF EXISTS agegroup")


def downgrade():
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agegroup') "
        "THEN CREATE TYPE agegroup AS ENUM ('1','2','3-4','5-6','7-8'); "
        "END IF; "
        "END $$;"
    )
    op.execute("ALTER TABLE olympiads ALTER COLUMN age_group TYPE agegroup USING age_group::agegroup")
