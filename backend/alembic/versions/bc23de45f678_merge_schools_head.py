"""merge schools head

Revision ID: bc23de45f678
Revises: aa2f0f4b9c1a, ab12cd34ef56
Create Date: 2026-01-17 18:30:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "bc23de45f678"
down_revision: Union[str, Sequence[str], None] = ("aa2f0f4b9c1a", "ab12cd34ef56")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
