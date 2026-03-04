"""add announcement campaigns and group targeting

Revision ID: 4f9c2a7b1d3e
Revises: bc23de45f678
Create Date: 2026-03-04 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4f9c2a7b1d3e"
down_revision: Union[str, None] = "bc23de45f678"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcement_campaigns (
            id SERIAL PRIMARY KEY,
            code VARCHAR(64) NOT NULL UNIQUE,
            title_default VARCHAR(255) NOT NULL,
            common_text TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT FALSE,
            starts_at TIMESTAMPTZ NULL,
            ends_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcement_campaigns_code ON announcement_campaigns(code);")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_campaigns_is_active ON announcement_campaigns(is_active);"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcement_group_messages (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES announcement_campaigns(id) ON DELETE CASCADE,
            subject VARCHAR(16) NOT NULL,
            group_number INTEGER NOT NULL,
            group_title VARCHAR(255) NOT NULL,
            group_text TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            starts_at TIMESTAMPTZ NULL,
            ends_at TIMESTAMPTZ NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_announcement_group_message UNIQUE (campaign_id, subject, group_number)
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_group_messages_campaign_id ON announcement_group_messages(campaign_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_group_messages_subject ON announcement_group_messages(subject);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_group_messages_group_number ON announcement_group_messages(group_number);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_group_messages_is_active ON announcement_group_messages(is_active);"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcement_assignments (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES announcement_campaigns(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject VARCHAR(16) NOT NULL,
            group_number INTEGER NOT NULL,
            source_file VARCHAR(255) NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_announcement_assignment UNIQUE (campaign_id, user_id, subject)
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_assignments_campaign_id ON announcement_assignments(campaign_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_assignments_user_id ON announcement_assignments(user_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_assignments_subject ON announcement_assignments(subject);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_assignments_group_number ON announcement_assignments(group_number);"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcement_campaign_fallbacks (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL UNIQUE REFERENCES announcement_campaigns(id) ON DELETE CASCADE,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            title VARCHAR(255) NOT NULL,
            text TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_campaign_fallbacks_campaign_id ON announcement_campaign_fallbacks(campaign_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcement_campaign_fallbacks_enabled ON announcement_campaign_fallbacks(enabled);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS announcement_campaign_fallbacks CASCADE;")
    op.execute("DROP TABLE IF EXISTS announcement_assignments CASCADE;")
    op.execute("DROP TABLE IF EXISTS announcement_group_messages CASCADE;")
    op.execute("DROP TABLE IF EXISTS announcement_campaigns CASCADE;")
