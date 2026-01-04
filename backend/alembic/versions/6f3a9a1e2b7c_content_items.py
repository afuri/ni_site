"""Add content items.

Revision ID: 6f3a9a1e2b7c
Revises: 4c8a0c4b1d2e
Create Date: 2026-01-20 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "6f3a9a1e2b7c"
down_revision = "4c8a0c4b1d2e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    content_type = sa.Enum("article", "news", name="content_type")
    content_status = sa.Enum("draft", "published", name="content_status")
    content_type.create(op.get_bind(), checkfirst=True)
    content_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "content_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("content_type", content_type, nullable=False),
        sa.Column("status", content_status, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "image_keys",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("published_by_id", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_content_items_type", "content_items", ["content_type"])
    op.create_index("ix_content_items_status", "content_items", ["status"])
    op.create_index("ix_content_items_author", "content_items", ["author_id"])
    op.create_index("ix_content_items_published_at", "content_items", ["published_at"])


def downgrade() -> None:
    op.drop_index("ix_content_items_published_at", table_name="content_items")
    op.drop_index("ix_content_items_author", table_name="content_items")
    op.drop_index("ix_content_items_status", table_name="content_items")
    op.drop_index("ix_content_items_type", table_name="content_items")
    op.drop_table("content_items")

    content_status = sa.Enum("draft", "published", name="content_status")
    content_type = sa.Enum("article", "news", name="content_type")
    content_status.drop(op.get_bind(), checkfirst=True)
    content_type.drop(op.get_bind(), checkfirst=True)
