"""add manual_teachers to users

Revision ID: aa2f0f4b9c1a
Revises: 9f6b35f4c6b1
Create Date: 2026-01-17 03:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "aa2f0f4b9c1a"
down_revision: Union[str, None] = "9f6b35f4c6b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "manual_teachers",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column("users", "manual_teachers", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "manual_teachers")
