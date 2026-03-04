"""merge announcement heads

Revision ID: 6b7c8d9e0f1a
Revises: 4f9c2a7b1d3e, d4e5f6a7b8c9
Create Date: 2026-03-04 13:00:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "6b7c8d9e0f1a"
down_revision: Union[str, Sequence[str], None] = ("4f9c2a7b1d3e", "d4e5f6a7b8c9")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
