"""Contact outcome tags (B), call logging redesign (F), suspended user status (D-52),
nullable contact location + incomplete flag (C-33/34), with backfill from legacy data.

Revision ID: 20260824_tags_calls
Revises: 20260528_schema
Create Date: 2026-08-24
"""
from alembic import op

revision = '20260824_tags_calls'
down_revision = '20260528_schema'
branch_labels = None
depends_on = None


def upgrade():
    # ── D-52: suspended user status ─────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            ALTER TYPE userstatus ADD VALUE IF NOT EXISTS 'suspended';
        EXCEPTION WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
        END $$;
    """)

    # ── C-33/34: contacts.location becomes nullable, add is_incomplete ─────
    op.execute("ALTER TABLE contacts ALTER COLUMN location DROP NOT NULL;")
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_incomplete BOOLEAN NOT NULL DEFAULT FALSE;")
    op.execute("""
        UPDATE contacts
        SET is_incomplete = TRUE
        WHERE location IS NULL OR location = '' OR name = 'Unnamed contact';
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_contacts_is_incomplete ON contacts(is_incomplete);")

    # ── B-17: tag_definitions (config-driven, not a hardcoded enum) ────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS tag_definitions (
            id              UUID PRIMARY KEY,
            organisation_id UUID NOT NULL REFERENCES organisations(id),
            code            VARCHAR(40) NOT NULL,
            label           VARCHAR(60) NOT NULL,
            color           VARCHAR(20),
            icon            VARCHAR(30),
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_tag_definitions_org_code UNIQUE (organisation_id, code)
        );
        CREATE INDEX IF NOT EXISTS ix_tag_definitions_org_active
            ON tag_definitions(organisation_id, is_active);
    """)

    # Seed the initial tag set (B-17) for every existing organisation.
    op.execute("""
        INSERT INTO tag_definitions (id, organisation_id, code, label, color, icon, sort_order)
        SELECT gen_random_uuid(), o.id, t.code, t.label, t.color, t.icon, t.sort_order
        FROM organisations o
        CROSS JOIN (VALUES
            ('saved',          'Saved',          '#22C55E', 'flame',     1),
            ('form_filled',    'Form Filled',    '#3B82F6', 'clipboard', 2),
            ('healed',         'Healed',         '#F59E0B', 'heart',     3),
            ('needs_followup', 'Needs Follow-up','#EF4444', 'alert',     4),
            ('attended',       'Attended',       '#8B5CF6', 'check',     5)
        ) AS t(code, label, color, icon, sort_order)
        ON CONFLICT (organisation_id, code) DO NOTHING;
    """)

    # ── B-16/19: contact_tags many-to-many ──────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS contact_tags (
            id         UUID PRIMARY KEY,
            contact_id UUID NOT NULL REFERENCES contacts(id),
            tag_code   VARCHAR(40) NOT NULL,
            set_by     UUID NOT NULL REFERENCES users(id),
            set_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            note       VARCHAR(300),
            CONSTRAINT uq_contact_tags_contact_code UNIQUE (contact_id, tag_code)
        );
        CREATE INDEX IF NOT EXISTS ix_contact_tags_contact_id ON contact_tags(contact_id);
        CREATE INDEX IF NOT EXISTS ix_contact_tags_code       ON contact_tags(tag_code);
    """)

    # B-23: backfill contact_tags from legacy Contact.attended / needs_transport
    # and from ContactStatusCode rows, so nothing is lost when the new system
    # ships. `set_by` falls back to the contact's own volunteer (added_by)
    # since the legacy booleans/status rows don't individually record who set
    # them at the granularity the new table expects.
    op.execute("""
        INSERT INTO contact_tags (id, contact_id, tag_code, set_by, set_at)
        SELECT gen_random_uuid(), c.id, 'attended', c.added_by,
               COALESCE(c.attended_at, c.created_at)
        FROM contacts c
        WHERE c.attended = TRUE
        ON CONFLICT (contact_id, tag_code) DO NOTHING;
    """)
    op.execute("""
        INSERT INTO contact_tags (id, contact_id, tag_code, set_by, set_at)
        SELECT gen_random_uuid(), c.id, 'needs_followup', c.added_by, c.created_at
        FROM contacts c
        WHERE c.needs_transport = TRUE
        ON CONFLICT (contact_id, tag_code) DO NOTHING;
    """)
    op.execute("""
        INSERT INTO contact_tags (id, contact_id, tag_code, set_by, set_at)
        SELECT gen_random_uuid(), cs.contact_id, 'saved', cs.updated_by, cs.updated_at
        FROM contact_statuses cs
        WHERE cs.status_code = 'coming'
        ON CONFLICT (contact_id, tag_code) DO NOTHING;
    """)

    # ── F-66/67: call_logs, receptivity/availability enums ──────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE receptivitycode AS ENUM ('picked_up','no_answer','wrong_number','invalid_number');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE availabilitycode AS ENUM ('coming','not_coming','needs_reminder','needs_bus');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS call_logs (
            id                UUID PRIMARY KEY,
            contact_id        UUID NOT NULL REFERENCES contacts(id),
            called_by         UUID NOT NULL REFERENCES users(id),
            called_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            receptivity_code  receptivitycode NOT NULL,
            availability_code availabilitycode,
            comment           VARCHAR(280),
            CONSTRAINT chk_call_logs_availability_requires_pickup
                CHECK ((availability_code IS NULL) OR (receptivity_code = 'picked_up'))
        );
        CREATE INDEX IF NOT EXISTS ix_call_logs_contact_id        ON call_logs(contact_id);
        CREATE INDEX IF NOT EXISTS ix_call_logs_contact_called_at ON call_logs(contact_id, called_at);
        CREATE INDEX IF NOT EXISTS ix_call_logs_called_by         ON call_logs(called_by);
    """)

    # F-75: one-time backfill of old contact_statuses rows into the new
    # receptivity/availability shape. The old table is left in place,
    # read-only, in case anything still references it (per F-75) — nothing
    # here drops contact_statuses or ContactStatusCode.
    op.execute("""
        INSERT INTO call_logs (id, contact_id, called_by, called_at, receptivity_code, availability_code)
        SELECT gen_random_uuid(), cs.contact_id, cs.updated_by, cs.updated_at, 'picked_up',
            CASE cs.status_code
                WHEN 'coming'          THEN 'coming'
                WHEN 'undecided'       THEN 'needs_reminder'
                WHEN 'not_coming'      THEN 'not_coming'
                WHEN 'needs_transport' THEN 'needs_bus'
            END::availabilitycode
        FROM contact_statuses cs
        WHERE cs.status_code IN ('coming','undecided','not_coming','needs_transport');
    """)
    op.execute("""
        INSERT INTO call_logs (id, contact_id, called_by, called_at, receptivity_code)
        SELECT gen_random_uuid(), cs.contact_id, cs.updated_by, cs.updated_at,
            CASE cs.status_code
                WHEN 'no_answer'    THEN 'no_answer'
                WHEN 'wrong_number' THEN 'wrong_number'
                WHEN 'unreachable'  THEN 'no_answer'
            END::receptivitycode
        FROM contact_statuses cs
        WHERE cs.status_code IN ('no_answer','wrong_number','unreachable');
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS call_logs;")
    op.execute("DROP TYPE IF EXISTS receptivitycode;")
    op.execute("DROP TYPE IF EXISTS availabilitycode;")
    op.execute("DROP TABLE IF EXISTS contact_tags;")
    op.execute("DROP TABLE IF EXISTS tag_definitions;")
    op.execute("ALTER TABLE contacts DROP COLUMN IF EXISTS is_incomplete;")
    # NOTE: we intentionally do NOT restore `location NOT NULL` here — any
    # rows created via the mass-paste-import flow while this migration was
    # applied may legitimately have a NULL location, and re-adding the
    # constraint would fail the downgrade outright on real data. If a clean
    # downgrade to the old NOT NULL constraint is genuinely needed, backfill
    # NULL locations to a placeholder first, then run:
    #   ALTER TABLE contacts ALTER COLUMN location SET NOT NULL;
    #
    # Postgres also does not support removing a value from an ENUM type
    # (userstatus 'suspended'), so that addition is not reversed here either
    # — this is a documented, standard Postgres limitation, not an oversight.
