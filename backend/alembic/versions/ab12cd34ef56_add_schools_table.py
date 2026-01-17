"""add schools table

Revision ID: ab12cd34ef56
Revises: 9f6b35f4c6b1
Create Date: 2026-01-17 18:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ab12cd34ef56"
down_revision: Union[str, None] = "9f6b35f4c6b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "schools",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("city", "name", name="uq_schools_city_name"),
    )
    op.create_index("ix_schools_city", "schools", ["city"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_schools_city", table_name="schools")
    op.drop_table("schools")
