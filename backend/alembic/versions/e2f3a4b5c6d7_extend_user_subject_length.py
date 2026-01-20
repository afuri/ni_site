"""extend user subject length

Revision ID: e2f3a4b5c6d7
Revises: c3d4e5f6a7b8
Create Date: 2026-01-20 09:15:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "subject",
        existing_type=sa.String(length=20),
        type_=sa.String(length=120),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "subject",
        existing_type=sa.String(length=120),
        type_=sa.String(length=20),
        existing_nullable=True,
    )
