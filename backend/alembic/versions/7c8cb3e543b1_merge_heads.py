"""merge heads"""
from alembic import op
import sqlalchemy as sa

revision = "7c8cb3e543b1"
down_revision = ("a1b2c3d4e5f7", "b2c3d4e5f6a7")
branch_labels = None
depends_on = None

def upgrade():
    pass

def downgrade():
    pass
