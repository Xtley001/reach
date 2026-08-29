"""Add optional remind_at column to call_logs (F-76)

Revision ID: 20260826_remind_at
Revises: 20260824_tags_calls
Create Date: 2026-08-26
"""
from alembic import op

revision = '20260826_remind_at'
down_revision = '20260824_tags_calls'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_call_logs_remind_at ON call_logs(remind_at) WHERE remind_at IS NOT NULL;")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_call_logs_remind_at;")
    op.execute("ALTER TABLE call_logs DROP COLUMN IF EXISTS remind_at;")
