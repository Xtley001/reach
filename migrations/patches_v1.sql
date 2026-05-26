-- ═══════════════════════════════════════════════════════════════════════════
-- REACH — Audit Patch SQL  (v1.0.0 → patched)
-- Apply to existing databases AFTER running schema.sql.
-- All statements are idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── P0-4.1: Replace UNIQUE constraint with partial index ─────────────────
-- Old constraint does full index scan for uniqueness on large datasets.
-- Partial index excludes soft-deleted contacts, saving space and scan time.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_contact_phone_campaign'
  ) THEN
    ALTER TABLE contacts DROP CONSTRAINT uq_contact_phone_campaign;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uix_contacts_phone_campaign_active
  ON contacts(phone, campaign_id)
  WHERE deleted_at IS NULL;


-- ─── P1-4.2: Prevent non-deterministic current_status on same-timestamp inserts
ALTER TABLE contact_statuses
  DROP CONSTRAINT IF EXISTS uq_contact_status_time;
ALTER TABLE contact_statuses
  ADD CONSTRAINT uq_contact_status_time
  UNIQUE (contact_id, updated_at);


-- ─── P1-4.3: Prevent duplicate check-ins at DB level ─────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uix_attendances_contact_campaign
  ON attendances(contact_id, campaign_id)
  WHERE contact_id IS NOT NULL;


-- ─── P1-4.4: Enforce E.164 on decisions.phone_1 ──────────────────────────
ALTER TABLE decisions
  DROP CONSTRAINT IF EXISTS chk_decision_phone_e164;
ALTER TABLE decisions
  ADD CONSTRAINT chk_decision_phone_e164
  CHECK (phone_1 ~ '^\+[1-9]\d{7,14}$');


-- ─── P1-4.5: Add updated_at triggers for ORM-bypass safety ───────────────
CREATE OR REPLACE FUNCTION reach_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decisions_updated_at  ON decisions;
DROP TRIGGER IF EXISTS trg_logistics_updated_at  ON logistics;

CREATE TRIGGER trg_decisions_updated_at
  BEFORE UPDATE ON decisions
  FOR EACH ROW EXECUTE FUNCTION reach_update_updated_at();

CREATE TRIGGER trg_logistics_updated_at
  BEFORE UPDATE ON logistics
  FOR EACH ROW EXECUTE FUNCTION reach_update_updated_at();


-- ─── P2-4.7: Link OTP sessions to user_id for cross-channel lockout ───────
ALTER TABLE otp_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS ix_otp_sessions_user_id
  ON otp_sessions(user_id)
  WHERE user_id IS NOT NULL;


-- ─── P2-4.8: Composite index on follow_up_queues for call queue page ──────
CREATE INDEX IF NOT EXISTS ix_follow_up_queues_assigned_status
  ON follow_up_queues(assigned_to, status)
  WHERE status IN ('pending', 'in_progress');


-- ─── P3-4.10: Add missing FK on campaigns.created_by ─────────────────────
-- Add FK only if column exists and constraint does not
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'created_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'campaigns'
      AND ccu.column_name = 'created_by'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT fk_campaigns_created_by
      FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
END $$;


-- ─── P1-1.7: Upgrade audit_logs.log_metadata to JSONB ────────────────────
-- Adds a new jsonb column alongside the old text column for gradual migration.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Migrate existing text data to jsonb where valid
UPDATE audit_logs
  SET metadata = log_metadata::jsonb
  WHERE log_metadata IS NOT NULL
    AND metadata IS NULL
    AND log_metadata ~ '^\{';

CREATE INDEX IF NOT EXISTS ix_audit_logs_metadata
  ON audit_logs USING gin(metadata)
  WHERE metadata IS NOT NULL;


-- ─── P2-6.3: Materialised view for demographics ───────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_demographics AS
  SELECT
    c.campaign_id,
    c.organisation_id,
    COALESCE(
      (SELECT cs.status_code::text
       FROM contact_statuses cs
       WHERE cs.contact_id = c.id
       ORDER BY cs.updated_at DESC
       LIMIT 1),
      'no_answer'
    ) AS status_code,
    c.location,
    COUNT(*) AS contact_count
  FROM contacts c
  WHERE c.deleted_at IS NULL
  GROUP BY c.campaign_id, c.organisation_id, status_code, c.location;

CREATE UNIQUE INDEX IF NOT EXISTS uix_mv_demographics
  ON mv_demographics(campaign_id, status_code, location);

-- Note: refresh with:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_demographics;
-- Add to a pg_cron job or call from a background task every 5 minutes.


-- ─── Verify patches applied ───────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  -- Check partial index
  SELECT COUNT(*) INTO v_count FROM pg_indexes
    WHERE indexname = 'uix_contacts_phone_campaign_active';
  IF v_count = 0 THEN RAISE WARNING 'PATCH MISSING: uix_contacts_phone_campaign_active'; END IF;

  -- Check attendance dedup index
  SELECT COUNT(*) INTO v_count FROM pg_indexes
    WHERE indexname = 'uix_attendances_contact_campaign';
  IF v_count = 0 THEN RAISE WARNING 'PATCH MISSING: uix_attendances_contact_campaign'; END IF;

  -- Check decisions trigger
  SELECT COUNT(*) INTO v_count FROM pg_trigger
    WHERE tgname = 'trg_decisions_updated_at';
  IF v_count = 0 THEN RAISE WARNING 'PATCH MISSING: trg_decisions_updated_at'; END IF;

  RAISE NOTICE 'REACH audit patches verification complete.';
END $$;
