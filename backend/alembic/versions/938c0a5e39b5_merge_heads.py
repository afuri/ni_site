"""merge heads

Revision ID: 938c0a5e39b5
Revises: a5c725df7d30, bc1d2a3f4e5f
Create Date: 2026-01-02 21:38:41.869158

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '938c0a5e39b5'
down_revision: Union[str, None] = ('a5c725df7d30', 'bc1d2a3f4e5f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
