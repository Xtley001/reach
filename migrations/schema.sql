-- ═══════════════════════════════════════════════════════════════════════════
-- REACH — Full Database Schema
-- Run once on a fresh Supabase PostgreSQL database.
-- All statements are idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

SET statement_timeout = '0';
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'volunteer','hub_leader','minister','registration_team','decisions_team'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_status AS ENUM ('pending','active','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE campaign_status AS ENUM ('active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_status_code AS ENUM (
    'message_sent','coming','undecided','not_coming',
    'no_answer','wrong_number','needs_transport','unreachable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE transport_status AS ENUM ('pending','arranged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE follow_up_queue_type AS ENUM (
    'thank_you','missed_you','soft_checkin','discipleship'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE follow_up_status AS ENUM ('pending','in_progress','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Organisations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Campaigns ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id       UUID           NOT NULL REFERENCES organisations(id),
  name                  VARCHAR(200)   NOT NULL,
  target_count          INTEGER,
  programme_date        TIMESTAMPTZ,
  event_date            DATE,
  venue                 VARCHAR(300),
  status                campaign_status NOT NULL DEFAULT 'active',
  attendance_mode_open  BOOLEAN        NOT NULL DEFAULT FALSE,
  attendance_opened_at  TIMESTAMPTZ,
  attendance_closed_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_by            UUID
);

-- Add event_date and attendance columns if upgrading existing database
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS event_date           DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attendance_mode_open BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attendance_opened_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attendance_closed_at TIMESTAMPTZ;

-- ─── Hubs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hubs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID        NOT NULL REFERENCES campaigns(id),
  organisation_id UUID        NOT NULL REFERENCES organisations(id),
  name            VARCHAR(200) NOT NULL,
  zone            VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id      UUID        NOT NULL REFERENCES organisations(id),
  hub_id               UUID        REFERENCES hubs(id),
  phone                VARCHAR(20),
  email                VARCHAR(254),
  name                 VARCHAR(100),
  avatar_url           VARCHAR(500),
  role                 user_role   NOT NULL DEFAULT 'volunteer',
  status               user_status NOT NULL DEFAULT 'pending',
  is_registration_team BOOLEAN     NOT NULL DEFAULT FALSE,
  is_decisions_team    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at       TIMESTAMPTZ,
  UNIQUE (phone, organisation_id),
  UNIQUE (email, organisation_id),
  CONSTRAINT chk_phone_e164 CHECK (phone ~ '^\+[1-9]\d{7,14}$')
);

-- Add event team columns if upgrading
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_registration_team BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_decisions_team    BOOLEAN NOT NULL DEFAULT FALSE;

-- Add registration_team and decisions_team to enum if upgrading
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'registration_team';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'decisions_team';
EXCEPTION WHEN others THEN NULL; END $$;

-- ─── Contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID         NOT NULL REFERENCES campaigns(id),
  added_by           UUID         NOT NULL REFERENCES users(id),
  organisation_id    UUID         NOT NULL REFERENCES organisations(id),
  name               VARCHAR(100) NOT NULL,
  phone              VARCHAR(20)  NOT NULL,
  location           VARCHAR(200) NOT NULL,
  notes              VARCHAR(1000),
  needs_transport    BOOLEAN      NOT NULL DEFAULT FALSE,
  transport_location VARCHAR(200),
  source             VARCHAR(20)  NOT NULL DEFAULT 'volunteer'
                     CHECK (source IN ('volunteer','walk-in','paper_form')),
  how_did_you_hear   VARCHAR(200),
  email              VARCHAR(254),
  second_phone       VARCHAR(20),
  attended           BOOLEAN      NOT NULL DEFAULT FALSE,
  attended_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  UNIQUE (phone, campaign_id),
  CONSTRAINT chk_contact_phone_e164 CHECK (phone ~ '^\+[1-9]\d{7,14}$')
);

-- Add new columns if upgrading
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source           VARCHAR(20)  NOT NULL DEFAULT 'volunteer';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS how_did_you_hear VARCHAR(200);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email            VARCHAR(254);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS second_phone     VARCHAR(20);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS attended         BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS attended_at      TIMESTAMPTZ;

-- ─── Contact Statuses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_statuses (
  id          UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID               NOT NULL REFERENCES contacts(id),
  status_code contact_status_code NOT NULL,
  updated_by  UUID               NOT NULL REFERENCES users(id),
  updated_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  note        VARCHAR(500)
);

-- ─── Message Templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID        NOT NULL REFERENCES campaigns(id),
  organisation_id UUID        NOT NULL REFERENCES organisations(id),
  label           VARCHAR(100) NOT NULL,
  body            TEXT        NOT NULL,
  created_by      UUID        NOT NULL REFERENCES users(id),
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Message Sends ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_sends (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID        NOT NULL REFERENCES contacts(id),
  template_id UUID        NOT NULL REFERENCES message_templates(id),
  sent_by     UUID        NOT NULL REFERENCES users(id),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES users(id),
  organisation_id UUID        REFERENCES organisations(id),
  action          VARCHAR(100) NOT NULL,
  entity_type     VARCHAR(50),
  entity_id       VARCHAR(100),
  ip_address      VARCHAR(45),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  log_metadata    TEXT
);

-- ─── OTP Sessions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash VARCHAR(200) NOT NULL UNIQUE,
  channel         VARCHAR(10)  NOT NULL DEFAULT 'sms',
  otp_hash        VARCHAR(200) NOT NULL,
  attempts        INTEGER      NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ  NOT NULL,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  VARCHAR(200) NOT NULL UNIQUE,
  user_id     UUID        NOT NULL REFERENCES users(id),
  family_id   UUID        NOT NULL,
  device_hint VARCHAR(200),
  used_at     TIMESTAMPTZ,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Logistics ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logistics (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       UUID             NOT NULL UNIQUE REFERENCES contacts(id),
  organisation_id  UUID             NOT NULL REFERENCES organisations(id),
  transport_status transport_status NOT NULL DEFAULT 'pending',
  coordinator_note VARCHAR(500),
  updated_by       UUID             REFERENCES users(id),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ─── Follow-Up Queues ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_queues (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID                 NOT NULL REFERENCES contacts(id),
  campaign_id     UUID                 NOT NULL REFERENCES campaigns(id),
  organisation_id UUID                 NOT NULL REFERENCES organisations(id),
  queue_type      follow_up_queue_type NOT NULL,
  assigned_to     UUID                 REFERENCES users(id),
  status          follow_up_status     NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

-- ─── Invite Tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  VARCHAR(200) NOT NULL UNIQUE,
  role        user_role   NOT NULL DEFAULT 'hub_leader',
  hub_id      UUID        REFERENCES hubs(id),
  phone       VARCHAR(20),
  email       VARCHAR(254),
  channel     VARCHAR(10)  NOT NULL DEFAULT 'sms',
  invited_by  UUID        NOT NULL REFERENCES users(id),
  name_hint   VARCHAR(100),
  expires_at  TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS email   VARCHAR(254);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS channel VARCHAR(10) NOT NULL DEFAULT 'sms';

-- ─── Attendances ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendances (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id       UUID        REFERENCES contacts(id),
  organisation_id  UUID        NOT NULL REFERENCES organisations(id),
  checked_in_by    UUID        NOT NULL REFERENCES users(id),
  checked_in_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_walk_in       BOOLEAN     NOT NULL DEFAULT FALSE,
  source           VARCHAR(20) NOT NULL DEFAULT 'gate_search'
                   CHECK (source IN ('gate_search','walk-in','paper_form')),
  how_did_you_hear VARCHAR(200),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Decisions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  organisation_id       UUID        NOT NULL REFERENCES organisations(id),
  contact_id            UUID        REFERENCES contacts(id),
  counsellor_id         UUID        NOT NULL REFERENCES users(id),
  source                VARCHAR(20) NOT NULL DEFAULT 'real_time'
                        CHECK (source IN ('real_time','paper_form')),

  -- Identity
  name                  VARCHAR(100) NOT NULL,
  phone_1               VARCHAR(20)  NOT NULL,
  phone_2               VARCHAR(20),
  whatsapp_number       VARCHAR(20),
  email                 VARCHAR(254),
  area                  VARCHAR(200),
  nearest_landmark      VARCHAR(200),

  -- Decision
  decision_type         VARCHAR(30)  NOT NULL
                        CHECK (decision_type IN (
                          'salvation','rededication','holy_spirit','healing','prayer','other'
                        )),
  decision_type_other   VARCHAR(200),
  first_time            BOOLEAN,
  currently_attending   VARCHAR(10)  CHECK (currently_attending IN ('yes','no','used_to')),
  current_church        VARCHAR(200),
  wants_church_referral BOOLEAN,
  referral_area         VARCHAR(200),

  -- Background
  age_range             VARCHAR(20),
  gender                VARCHAR(30),
  occupation            VARCHAR(200),
  how_did_you_hear      VARCHAR(200),
  brought_by            VARCHAR(200),
  notes                 TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Export Log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL REFERENCES organisations(id),
  exported_by     UUID        NOT NULL REFERENCES users(id),
  export_type     VARCHAR(60) NOT NULL,
  filter_hub_id   UUID,
  filter_status   VARCHAR(30),
  date_range_from DATE,
  date_range_to   DATE,
  row_count       INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Users
CREATE INDEX IF NOT EXISTS ix_users_hub_id       ON users(hub_id);
CREATE INDEX IF NOT EXISTS ix_users_status        ON users(status);
CREATE INDEX IF NOT EXISTS ix_users_org_role      ON users(organisation_id, role);

-- Contacts
CREATE INDEX IF NOT EXISTS ix_contacts_campaign_id     ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS ix_contacts_added_by        ON contacts(added_by);
CREATE INDEX IF NOT EXISTS ix_contacts_organisation_id ON contacts(organisation_id);
CREATE INDEX IF NOT EXISTS ix_contacts_deleted_at      ON contacts(deleted_at);
CREATE INDEX IF NOT EXISTS ix_contacts_needs_transport ON contacts(needs_transport);
CREATE INDEX IF NOT EXISTS ix_contacts_attended        ON contacts(attended, campaign_id);
CREATE INDEX IF NOT EXISTS ix_contacts_source          ON contacts(source);

-- Contact Statuses
CREATE INDEX IF NOT EXISTS ix_contact_statuses_contact_id      ON contact_statuses(contact_id);
CREATE INDEX IF NOT EXISTS ix_contact_statuses_updated_by      ON contact_statuses(updated_by);
CREATE INDEX IF NOT EXISTS ix_contact_statuses_contact_updated ON contact_statuses(contact_id, updated_at);
CREATE INDEX IF NOT EXISTS ix_contact_statuses_code            ON contact_statuses(status_code);

-- OTP / Auth
CREATE INDEX IF NOT EXISTS ix_otp_sessions_hash         ON otp_sessions(identifier_hash);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_family_id  ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_hash       ON refresh_tokens(token_hash);

-- Invite Tokens
CREATE INDEX IF NOT EXISTS ix_invite_tokens_token_hash ON invite_tokens(token_hash);

-- Audit Logs
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at);

-- Attendances
CREATE INDEX IF NOT EXISTS ix_attendances_campaign    ON attendances(campaign_id);
CREATE INDEX IF NOT EXISTS ix_attendances_contact     ON attendances(contact_id);
CREATE INDEX IF NOT EXISTS ix_attendances_source      ON attendances(source);
CREATE INDEX IF NOT EXISTS ix_attendances_checked_in  ON attendances(checked_in_at);

-- Decisions
CREATE INDEX IF NOT EXISTS ix_decisions_campaign   ON decisions(campaign_id);
CREATE INDEX IF NOT EXISTS ix_decisions_counsellor ON decisions(counsellor_id);
CREATE INDEX IF NOT EXISTS ix_decisions_type       ON decisions(decision_type);
CREATE INDEX IF NOT EXISTS ix_decisions_created    ON decisions(created_at);

-- Export Log
CREATE INDEX IF NOT EXISTS ix_export_log_org ON export_log(organisation_id);
CREATE INDEX IF NOT EXISTS ix_export_log_by  ON export_log(exported_by);
