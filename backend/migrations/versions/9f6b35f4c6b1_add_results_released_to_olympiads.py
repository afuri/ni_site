"""add results_released to olympiads

Revision ID: 9f6b35f4c6b1
Revises: fe2d4c5b6a7c
Create Date: 2026-01-17 02:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9f6b35f4c6b1"
down_revision: Union[str, None] = "fe2d4c5b6a7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "olympiads",
        sa.Column("results_released", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute("UPDATE olympiads SET results_released = FALSE")
    op.alter_column("olympiads", "results_released", server_default=None)


def downgrade() -> None:
    op.drop_column("olympiads", "results_released")
