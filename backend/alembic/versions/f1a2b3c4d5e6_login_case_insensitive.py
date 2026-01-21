"""login case-insensitive index

Revision ID: f1a2b3c4d5e6
Revises: e2f3a4b5c6d7
Create Date: 2026-01-20 12:40:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_users_login_lower",
        "users",
        [sa.text("lower(login)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_users_login_lower", table_name="users")
