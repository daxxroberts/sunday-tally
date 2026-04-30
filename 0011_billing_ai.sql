-- ============================================================
-- Church Analytics — Billing + AI usage + Import jobs
-- Migration: 0011_billing_ai.sql
-- Generated: 2026-04-18
-- Adds: 45-day trial + Stripe subscription columns on churches,
--       billing_events (webhook audit), ai_usage_periods (budget caps),
--       ai_usage_events (per-call log), import_jobs (onboarding pipeline),
--       notifications_sent (email dedupe).
-- Decision refs: D-056 (flat $22/mo), D-057 (45-day trial),
--                D-058 (trial buckets), D-059 (paid shared pool),
--                D-060 (billing cols on churches, no projection table),
--                D-061 (Stripe is source of truth).
-- ============================================================


-- ============================================================
-- SECTION 0 — RLS HELPER: owner/admin role check
-- Used by billing_events, ai_usage_*, notifications_sent.
-- SECURITY DEFINER bypasses RLS on church_memberships (prevents recursion).
-- ============================================================

CREATE OR REPLACE FUNCTION is_church_owner_or_admin(p_church_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM church_memberships
    WHERE user_id   = (SELECT auth.uid())
      AND church_id = p_church_id
      AND role      IN ('owner', 'admin')
      AND is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION is_church_owner_or_admin(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION is_church_owner_or_admin(UUID) TO authenticated;


-- ============================================================
-- SECTION 1 — Extend churches with billing columns
-- trial_ends_at defaults to now() + 45 days at insert time. Postgres
-- rejects GENERATED columns for timestamptz + interval (not IMMUTABLE),
-- so this is a plain column. Existing rows get a fresh 45-day window.
-- ============================================================

ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS trial_started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '45 days'),
  ADD COLUMN IF NOT EXISTS stripe_customer_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status  TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS current_period_end   TIMESTAMPTZ;

ALTER TABLE churches
  DROP CONSTRAINT IF EXISTS chk_subscription_status;

ALTER TABLE churches
  ADD CONSTRAINT chk_subscription_status
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_churches_stripe_customer
  ON churches (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_churches_stripe_subscription
  ON churches (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;


-- ============================================================
-- SECTION 2 — billing_events (Stripe webhook audit + dedupe)
-- stripe_event_id UNIQUE enables idempotent webhook handling.
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        REFERENCES churches(id) ON DELETE SET NULL,
  stripe_event_id TEXT        NOT NULL UNIQUE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_church
  ON billing_events (church_id, created_at DESC);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Owner/admin can read their church's billing events; service role writes.
CREATE POLICY "billing_events_owner_admin_read"
  ON billing_events
  FOR SELECT
  TO authenticated
  USING (church_id IS NOT NULL AND is_church_owner_or_admin(church_id));


-- ============================================================
-- SECTION 3 — ai_usage_periods (budget caps per bucket/period)
-- Trial rows:  bucket IN ('setup','analytics'), period_key='trial',
--              cap_cents = 100 (setup) or 50 (analytics).
-- Paid rows:   bucket='shared', period_key='YYYY-MM', cap_cents=300.
-- Rows are lazily inserted by the budget layer (budget.ts).
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_periods (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  bucket      TEXT        NOT NULL,
  period_key  TEXT        NOT NULL,
  cents_used  INTEGER     NOT NULL DEFAULT 0,
  cap_cents   INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_ai_bucket CHECK (bucket IN ('setup', 'analytics', 'shared')),
  CONSTRAINT uq_ai_usage_period UNIQUE (church_id, bucket, period_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_periods_church
  ON ai_usage_periods (church_id);

CREATE TRIGGER set_updated_at_ai_usage_periods
  BEFORE UPDATE ON ai_usage_periods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_usage_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_periods_owner_admin_read"
  ON ai_usage_periods
  FOR SELECT
  TO authenticated
  USING (is_church_owner_or_admin(church_id));


-- ============================================================
-- SECTION 4 — ai_usage_events (append-only per-call log)
-- Every Claude call records tokens + cents + request_kind.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  request_kind    TEXT        NOT NULL,
  model           TEXT        NOT NULL,
  input_tokens    INTEGER     NOT NULL DEFAULT 0,
  output_tokens   INTEGER     NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_create_tokens INTEGER NOT NULL DEFAULT 0,
  cents           INTEGER     NOT NULL DEFAULT 0,
  bucket          TEXT        NOT NULL,
  period_key      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_ai_event_bucket CHECK (bucket IN ('setup', 'analytics', 'shared')),
  CONSTRAINT chk_ai_request_kind CHECK (request_kind IN ('import_stage_a', 'import_stage_b', 'analytics_chat'))
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_church_created
  ON ai_usage_events (church_id, created_at DESC);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_events_owner_admin_read"
  ON ai_usage_events
  FOR SELECT
  TO authenticated
  USING (is_church_owner_or_admin(church_id));


-- ============================================================
-- SECTION 5 — import_jobs (two-stage onboarding import)
-- sources         — jsonb array of { kind: 'csv'|'sheet_url'|'text', ref, meta }
-- proposed_mapping — Stage A output from Claude
-- confirmed_mapping — user-edited mapping at /onboarding/import/confirm
-- result_summary   — Stage B counts, errors, ids
-- ============================================================

CREATE TABLE IF NOT EXISTS import_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  created_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  status              TEXT        NOT NULL DEFAULT 'uploaded',
  sources             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  proposed_mapping    JSONB,
  confirmed_mapping   JSONB,
  result_summary      JSONB,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_import_status CHECK (status IN (
    'uploaded', 'mapping', 'awaiting_confirmation', 'extracting', 'done', 'failed'
  ))
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_church_created
  ON import_jobs (church_id, created_at DESC);

CREATE TRIGGER set_updated_at_import_jobs
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- All active members can see import jobs for their church.
-- Writes are performed by server actions under the user's session;
-- the church_id is injected server-side and must match their membership.
CREATE POLICY "import_jobs_church_isolation"
  ON import_jobs
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- SECTION 6 — notifications_sent (email dedupe)
-- Prevents duplicate trial-ending emails on cron reruns.
-- kind IN ('trial_ending_7d','trial_ending_1d','payment_failed',
--          'invite','ai_setup_exhausted').
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications_sent (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta        JSONB,

  CONSTRAINT uq_notification_kind UNIQUE (church_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_notifications_church
  ON notifications_sent (church_id, kind);

ALTER TABLE notifications_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_sent_owner_admin_read"
  ON notifications_sent
  FOR SELECT
  TO authenticated
  USING (is_church_owner_or_admin(church_id));
