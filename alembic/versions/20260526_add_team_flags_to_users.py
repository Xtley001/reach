"""add team flags to users

Revision ID: a1b2c3d4e5f6
Revises: 
Create Date: 2026-05-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_registration_team', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('is_decisions_team', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'is_decisions_team')
    op.drop_column('users', 'is_registration_team')
