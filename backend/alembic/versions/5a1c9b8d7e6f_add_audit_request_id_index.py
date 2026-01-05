"""Add index for audit request_id.

Revision ID: 5a1c9b8d7e6f
Revises: 8f4a2b3c1d2e
Create Date: 2026-01-05 11:15:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5a1c9b8d7e6f"
down_revision: Union[str, None] = "8f4a2b3c1d2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_audit_logs_request_id", "audit_logs", ["request_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_request_id", table_name="audit_logs")
