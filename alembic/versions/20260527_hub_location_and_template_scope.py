"""hub location fields and optional template hub scope

Revision ID: 20260527_hub_loc
Revises: a1b2c3d4e5f6
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

# E-58: these identifiers were missing entirely in the original file — Alembic
# requires the literal module attributes below (not just the docstring) to
# resolve migration order. Without them this revision was unreachable by
# `alembic upgrade head` and 20260528 (which declares no down_revision either)
# would have silently forked from `a1b2c3d4e5f6` instead of chaining after
# this one. Fixed as part of the E-58 "confirm migrations are reversible and
# tested" pass — this is a real bug, not part of the tag/call-log feature work.
revision = '20260527_hub_loc'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE hubs ADD COLUMN IF NOT EXISTS location TEXT")
    op.execute("ALTER TABLE hubs ADD COLUMN IF NOT EXISTS description TEXT")
    # Optional — uncomment if hub-scoped templates are desired:
    # op.execute("ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS hub_id UUID REFERENCES hubs(id)")


def downgrade():
    op.execute("ALTER TABLE hubs DROP COLUMN IF EXISTS location")
    op.execute("ALTER TABLE hubs DROP COLUMN IF EXISTS description")
