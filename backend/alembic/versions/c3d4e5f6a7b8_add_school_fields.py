"""add school fields

Revision ID: c3d4e5f6a7b8
Revises: bc23de45f678
Create Date: 2026-01-17 18:40:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "bc23de45f678"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("full_school_name", sa.String(length=1024), nullable=True))
    op.add_column("schools", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("schools", sa.Column("consorcium", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("schools", sa.Column("peterson", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("schools", sa.Column("sirius", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint("ck_schools_consorcium", "schools", "consorcium IN (0, 1)")
    op.create_check_constraint("ck_schools_peterson", "schools", "peterson IN (0, 1)")
    op.create_check_constraint("ck_schools_sirius", "schools", "sirius IN (0, 1)")
    op.alter_column("schools", "consorcium", server_default=None)
    op.alter_column("schools", "peterson", server_default=None)
    op.alter_column("schools", "sirius", server_default=None)


def downgrade() -> None:
    op.drop_constraint("ck_schools_sirius", "schools", type_="check")
    op.drop_constraint("ck_schools_peterson", "schools", type_="check")
    op.drop_constraint("ck_schools_consorcium", "schools", type_="check")
    op.drop_column("schools", "sirius")
    op.drop_column("schools", "peterson")
    op.drop_column("schools", "consorcium")
    op.drop_column("schools", "email")
    op.drop_column("schools", "full_school_name")
