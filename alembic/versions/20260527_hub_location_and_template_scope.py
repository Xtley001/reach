"""hub location fields and optional template hub scope

Revision ID: 20260527_hub_loc
Revises: 20260526_add_team_flags_to_users
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa


def upgrade():
    op.execute("ALTER TABLE hubs ADD COLUMN IF NOT EXISTS location TEXT")
    op.execute("ALTER TABLE hubs ADD COLUMN IF NOT EXISTS description TEXT")
    # Optional — uncomment if hub-scoped templates are desired:
    # op.execute("ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS hub_id UUID REFERENCES hubs(id)")


def downgrade():
    op.execute("ALTER TABLE hubs DROP COLUMN IF EXISTS location")
    op.execute("ALTER TABLE hubs DROP COLUMN IF EXISTS description")
