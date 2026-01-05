"""Add request_id to audit logs.

Revision ID: 8f4a2b3c1d2e
Revises: 3c2d8f1a9b0c
Create Date: 2026-01-05 10:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8f4a2b3c1d2e"
down_revision: Union[str, None] = "3c2d8f1a9b0c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("request_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("audit_logs", "request_id")
