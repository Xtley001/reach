"""Schema improvements: hub_id on contacts, attended status, demographics view with hub dimension, leader_id on hubs

Revision ID: 20260528_schema
Revises: 20260527_hub_loc
Create Date: 2026-05-28
"""
from alembic import op

# E-58: same missing-identifier bug as 20260527 — fixed here too so the full
# chain (a1b2c3d4e5f6 -> 20260527_hub_loc -> 20260528_schema -> ...) actually
# resolves under `alembic upgrade head`.
revision = '20260528_schema'
down_revision = '20260527_hub_loc'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS hub_id UUID REFERENCES hubs(id);
        UPDATE contacts c SET hub_id = u.hub_id FROM users u WHERE c.added_by = u.id AND c.hub_id IS NULL;
        CREATE INDEX IF NOT EXISTS ix_contacts_hub_id ON contacts(hub_id);
    """)

    op.execute("""
        DO $$ BEGIN
            ALTER TYPE contact_status_code ADD VALUE IF NOT EXISTS 'attended';
        EXCEPTION WHEN others THEN NULL; END $$;
    """)

    op.execute("""
        DROP MATERIALIZED VIEW IF EXISTS mv_demographics;
        CREATE MATERIALIZED VIEW mv_demographics AS
          SELECT
            c.campaign_id,
            c.organisation_id,
            u.hub_id,
            COALESCE(
              (SELECT cs.status_code::text FROM contact_statuses cs
               WHERE cs.contact_id = c.id ORDER BY cs.updated_at DESC LIMIT 1),
              'no_answer'
            ) AS status_code,
            c.location,
            COUNT(*) AS contact_count
          FROM contacts c
          JOIN users u ON u.id = c.added_by
          WHERE c.deleted_at IS NULL
          GROUP BY c.campaign_id, c.organisation_id, u.hub_id, status_code, c.location;

        CREATE UNIQUE INDEX uix_mv_demographics
          ON mv_demographics(campaign_id, COALESCE(hub_id::text, 'null'), status_code, location);

        REFRESH MATERIALIZED VIEW mv_demographics;
    """)

    op.execute("""
        ALTER TABLE hubs ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES users(id);
        UPDATE hubs h
        SET leader_id = (
            SELECT u.id FROM users u
            WHERE u.hub_id = h.id AND u.role = 'hub_leader'
            ORDER BY u.created_at ASC LIMIT 1
        );
    """)


def downgrade():
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS hub_id;")
    op.execute("ALTER TABLE hubs DROP COLUMN IF EXISTS leader_id;")
