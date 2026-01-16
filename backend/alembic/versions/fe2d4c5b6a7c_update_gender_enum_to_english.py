"""update gender enum to english values

Revision ID: fe2d4c5b6a7c
Revises: f7d2c3a4b5e6
Create Date: 2026-02-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "fe2d4c5b6a7c"
down_revision = "f7d2c3a4b5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create new enum
    gender_new = sa.Enum("male", "female", name="gender_new")
    gender_new.create(op.get_bind(), checkfirst=True)
    # Add temp column and copy data with mapping
    op.add_column("users", sa.Column("gender_tmp", gender_new, nullable=True))
    op.execute(
        "UPDATE users SET gender_tmp = (CASE gender::text "
        "WHEN 'муж' THEN 'male' "
        "WHEN 'жен' THEN 'female' "
        "ELSE gender::text END)::gender_new"
    )
    # Drop old column/enum and rename
    op.drop_column("users", "gender")
    op.alter_column("users", "gender_tmp", new_column_name="gender")
    op.execute("ALTER TYPE gender RENAME TO gender_old")
    op.execute("ALTER TYPE gender_new RENAME TO gender")
    op.execute("DROP TYPE gender_old")


def downgrade() -> None:
    gender_old = sa.Enum("муж", "жен", name="gender_old")
    gender_old.create(op.get_bind(), checkfirst=True)
    op.add_column("users", sa.Column("gender_tmp", gender_old, nullable=True))
    op.execute(
        "UPDATE users SET gender_tmp = CASE gender "
        "WHEN 'male' THEN 'муж' "
        "WHEN 'female' THEN 'жен' "
        "ELSE gender END"
    )
    op.drop_column("users", "gender")
    op.alter_column("users", "gender_tmp", new_column_name="gender")
    op.execute("ALTER TYPE gender RENAME TO gender_new")
    op.execute("ALTER TYPE gender_old RENAME TO gender")
    op.execute("DROP TYPE gender_new")
