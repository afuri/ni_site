"""Bounded cleanup and durable short-lived refresh rotation receipts."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = 'c6f7a8b9c0d1'
down_revision = 'b5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('refresh_rotations',
        sa.Column('old_hash',sa.String(128),primary_key=True),
        sa.Column('request_hash',sa.String(128),nullable=False),
        sa.Column('user_id',sa.Integer(),sa.ForeignKey('users.id',ondelete='CASCADE'),nullable=False),
        sa.Column('new_hash',sa.String(128),nullable=False),
        sa.Column('claims',JSONB(),nullable=False),
        sa.Column('expires_at',sa.DateTime(timezone=True),nullable=False))
    op.create_index('ix_refresh_rotations_user_id','refresh_rotations',['user_id'])
    op.create_index('ix_refresh_rotations_expires_at','refresh_rotations',['expires_at'])
    # Builds on potentially large token tables must not hold a migration transaction.
    with op.get_context().autocommit_block():
        # Keep the unique email constraint and case-insensitive unique index.
        unique_email = any(c['column_names'] == ['email'] for c in sa.inspect(op.get_bind()).get_unique_constraints('users'))
        if not unique_email:
            raise RuntimeError('Cannot remove email index without its unique constraint')
        op.drop_index('ix_users_email', table_name='users', postgresql_concurrently=True, if_exists=True)
        for table,terminal in [('refresh_tokens','revoked_at'),('email_verifications','used_at'),('password_resets','used_at')]:
            for column in ['token_hash','expires_at',terminal]:
                op.create_index(f'ix_{table}_{column}',table,[column],postgresql_concurrently=True,if_not_exists=True)


def downgrade():
    with op.get_context().autocommit_block():
        op.create_index("ix_users_email", "users", ["email"], postgresql_concurrently=True, if_not_exists=True)
        for table,terminal in [('refresh_tokens','revoked_at'),('email_verifications','used_at'),('password_resets','used_at')]:
            for column in ['token_hash','expires_at',terminal]:
                op.drop_index(f'ix_{table}_{column}',table_name=table,postgresql_concurrently=True,if_exists=True)
    op.drop_table('refresh_rotations')
