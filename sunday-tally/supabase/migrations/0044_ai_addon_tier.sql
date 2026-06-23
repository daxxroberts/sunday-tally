-- ============================================================
-- Church Analytics — AI + Dashboarding add-on tier
-- Migration: 0044_ai_addon_tier.sql
-- Status: NEEDS-APPROVAL — do NOT apply automatically.
--
-- Adds the AI add-on entitlement to churches and widens the AI usage
-- request_kind check so the widget builder is attributable on its own.
--
-- Pricing model (plan: Sunday Tally Pricing Structure & Plan-Gating):
--   base       $22/mo PER LOCATION (existing flat sub, D-056)
--   AI add-on  none | starter | plus | pro
--     starter  +$15/mo per location   — 15 widgets, $5 pooled ceiling (+$5/extra AI location)
--     plus     +$29/mo org            — 40 widgets, $12 pooled ceiling
--     pro      +$49/mo org            — unlimited widgets, $25 pooled, advanced model routing
--
-- The numeric caps live in code (src/lib/billing/entitlements.ts) so price
-- experiments don't require a migration. This column only records WHICH tier a
-- church is on; Stripe remains the source of truth and the webhook writes it.
-- Additive + backward-compatible (default 'none') — no data backfill needed.
-- ============================================================


-- ── churches.ai_addon_tier ──────────────────────────────────
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS ai_addon_tier TEXT NOT NULL DEFAULT 'none';

ALTER TABLE churches
  DROP CONSTRAINT IF EXISTS chk_ai_addon_tier;

ALTER TABLE churches
  ADD CONSTRAINT chk_ai_addon_tier
  CHECK (ai_addon_tier IN ('none', 'starter', 'plus', 'pro'));


-- ── widget builder gets its own request_kind ────────────────
-- Was: ('import_stage_a','import_stage_b','analytics_chat'). The widget builder
-- previously borrowed 'analytics_chat'; give it 'widget_builder' so per-feature
-- AI cost is attributable. Existing rows keep their values.
ALTER TABLE ai_usage_events
  DROP CONSTRAINT IF EXISTS chk_ai_request_kind;

ALTER TABLE ai_usage_events
  ADD CONSTRAINT chk_ai_request_kind
  CHECK (request_kind IN (
    'import_stage_a', 'import_stage_b', 'analytics_chat', 'widget_builder'
  ));
