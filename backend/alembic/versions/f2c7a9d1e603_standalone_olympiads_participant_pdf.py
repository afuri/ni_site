"""Common olympiads and private participant PDF metadata.

Revision ID: f2c7a9d1e603
Revises: a8b3d5f7c901
"""
from alembic import op
import sqlalchemy as sa

revision = "f2c7a9d1e603"
down_revision = "a8b3d5f7c901"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("olympiads", sa.Column("is_standalone", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("olympiads", sa.Column("participant_pdf_key", sa.String(512), nullable=True))
    op.create_check_constraint("ck_olympiads_participant_pdf_standalone", "olympiads", "participant_pdf_key IS NULL OR is_standalone")


def downgrade():
    op.drop_constraint("ck_olympiads_participant_pdf_standalone", "olympiads", type_="check")
    op.drop_column("olympiads", "participant_pdf_key")
    op.drop_column("olympiads", "is_standalone")
