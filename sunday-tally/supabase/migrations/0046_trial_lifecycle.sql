-- ============================================================
-- Migration 0046 — Trial lifecycle, soft-delete, reset & retention
-- STATUS: NEEDS-APPROVAL — write file only, do NOT apply. (BUILD_FLAGS.md)
-- ============================================================
-- WHY
--   Trial → expiry → grace → soft-delete → purge lifecycle, plus an
--   owner-driven "reset my church" (start over and re-import) and a
--   30-day widget-retention sweep for churches that keep base but have
--   no AI add-on. All deletion is anchored on CALENDAR/SUBSCRIPTION
--   expiry only — never AI-budget exhaustion (status.ts conflates the
--   two; the cron uses its own calendar predicate).
--
-- WHAT
--   A. churches: + expired_at, deleted_at, widget_retention_at
--   B. _wipe_church_content(uuid)   — internal, deletes all CONTENT rows
--                                     (FK-safe order), keeps billing/usage.
--   C. reset_church_data(uuid)      — OWNER-checked; wipe + re-seed a
--                                     fresh, importable church.
--   D. purge_church(uuid)           — service-role only; full hard delete
--                                     (content + memberships + church row).
--   E. delete_dropped_ai_widgets(uuid) — drop non-starter church widgets.
--
-- FK order derived from the live schema (list_tables, migrations 0001–0045).
-- Children are deleted before parents so the order is correct regardless of
-- each FK's ON DELETE rule. Keeps: churches, church_memberships,
-- user_profiles, billing_events, ai_usage_periods, ai_usage_events,
-- notifications_sent, church_invites, import_jobs (reset keeps AI usage so a
-- reset cannot refill the trial AI budget).
--
-- Depends on: get_user_role(uuid) (0029), seed_system_reporting_tags(uuid)
-- (signup provisioning), seed_starter_widgets(uuid) (0033).
-- ============================================================


-- ============================================================
-- PART A — lifecycle columns on churches
-- ============================================================
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS expired_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS widget_retention_at TIMESTAMPTZ;

COMMENT ON COLUMN churches.expired_at IS
  'Set by the lifecycle cron when the church first enters CALENDAR/subscription expiry (never AI-budget). Cleared on any active subscription. Anchors the grace + soft-delete clock.';
COMMENT ON COLUMN churches.deleted_at IS
  'Soft-delete marker, set at expired_at + 30d. Drives the Reactivate screen and the 60-day purge clock. Cleared if the church purchases.';
COMMENT ON COLUMN churches.widget_retention_at IS
  'Set when an active church has more non-starter widgets than its tier widgetCap. Cleared when resolved. Non-starter widgets are dropped 30d after this is set.';

-- Partial indexes so the cron sweeps stay cheap as the church table grows.
CREATE INDEX IF NOT EXISTS idx_churches_expired_at
  ON churches (expired_at) WHERE expired_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_churches_deleted_at
  ON churches (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_churches_widget_retention_at
  ON churches (widget_retention_at) WHERE widget_retention_at IS NOT NULL;


-- ============================================================
-- PART B — _wipe_church_content(uuid)  [internal]
-- ============================================================
-- Deletes every CONTENT row for a church in FK-safe order. Keeps the
-- church row, memberships, profiles, and all billing/usage/notification
-- history. Used by both reset_church_data (then re-seed) and purge_church
-- (then delete memberships + church).
-- ============================================================
CREATE OR REPLACE FUNCTION _wipe_church_content(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Leaf data first.
  DELETE FROM metric_entries       WHERE church_id = p_church_id;
  DELETE FROM service_template_tags WHERE church_id = p_church_id;

  -- 2. Schedule versions (no church_id — reach via the template).
  DELETE FROM service_schedule_versions
    WHERE service_template_id IN (SELECT id FROM service_templates WHERE church_id = p_church_id);

  -- 3. Service instances (referenced by metric_entries, now gone).
  DELETE FROM service_instances WHERE church_id = p_church_id;

  -- 4. Widget placements → dashboards → widgets.
  DELETE FROM dashboard_widgets WHERE church_id = p_church_id;
  DELETE FROM dashboards        WHERE church_id = p_church_id;
  DELETE FROM widgets           WHERE church_id = p_church_id;

  -- 5. Metrics (after metric_entries) → then the tags they referenced.
  DELETE FROM metrics        WHERE church_id = p_church_id;
  DELETE FROM reporting_tags WHERE church_id = p_church_id;

  -- 6. Templates (after instances / template_tags / schedules) → groups.
  DELETE FROM service_templates WHERE church_id = p_church_id;
  DELETE FROM service_groups    WHERE church_id = p_church_id;

  -- 7. Ministry tags (after metrics / templates / template_tags).
  DELETE FROM service_tags WHERE church_id = p_church_id;

  -- 8. Locations last — null out FKs pointing at them first.
  UPDATE church_memberships SET default_location_id = NULL WHERE church_id = p_church_id;
  DELETE FROM church_membership_locations
    WHERE membership_id IN (SELECT id FROM church_memberships WHERE church_id = p_church_id);
  DELETE FROM church_locations WHERE church_id = p_church_id;

  -- 9. Import history (a reset starts a clean import).
  DELETE FROM import_jobs WHERE church_id = p_church_id;
END;
$$;

REVOKE ALL ON FUNCTION _wipe_church_content(UUID) FROM PUBLIC;
-- internal only; not granted to authenticated. Callers are the two SECURITY
-- DEFINER functions below (which run as the definer/owner).


-- ============================================================
-- PART C — reset_church_data(uuid)  [owner-checked, RPC]
-- ============================================================
-- "Start over": wipe all content, then re-seed a fresh, importable church
-- (system reporting tags + a default Main Campus + starter widgets). The
-- church row, the owner's login, and billing/usage history are preserved.
--
-- SECURITY: runs as definer (bypasses RLS) so it can delete across tables,
-- but verifies the CALLER is an active OWNER of p_church_id. The church_id
-- argument is never trusted on its own.
-- ============================================================
CREATE OR REPLACE FUNCTION reset_church_data(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT get_user_role(p_church_id)) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'not_owner: only the church owner can reset church data';
  END IF;

  PERFORM _wipe_church_content(p_church_id);

  -- Re-seed the fresh-church baseline (mirrors signup provisioning).
  PERFORM seed_system_reporting_tags(p_church_id);

  INSERT INTO church_locations (church_id, name, code, sort_order, is_active)
  VALUES (p_church_id, 'Main Campus', 'MAIN', 1, true)
  ON CONFLICT DO NOTHING;

  PERFORM seed_starter_widgets(p_church_id);

  -- Clear any lifecycle flags — a reset church is a clean, active church.
  UPDATE churches
     SET widget_retention_at = NULL
   WHERE id = p_church_id;
END;
$$;

REVOKE ALL ON FUNCTION reset_church_data(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_church_data(UUID) TO authenticated;


-- ============================================================
-- PART D — purge_church(uuid)  [service-role only]
-- ============================================================
-- Full, irreversible hard delete used by the day-90 purge sweep. NO owner
-- check — only the service-role cron calls it, after re-verifying live that
-- the church has no active subscription. Not granted to authenticated.
-- ============================================================
CREATE OR REPLACE FUNCTION purge_church(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _wipe_church_content(p_church_id);

  -- Account + billing/usage rows that reset keeps but a purge removes.
  DELETE FROM church_invites          WHERE church_id = p_church_id;
  DELETE FROM notifications_sent       WHERE church_id = p_church_id;
  DELETE FROM ai_usage_events          WHERE church_id = p_church_id;
  DELETE FROM ai_usage_periods         WHERE church_id = p_church_id;
  UPDATE billing_events SET church_id = NULL WHERE church_id = p_church_id; -- keep Stripe audit trail
  DELETE FROM church_memberships       WHERE church_id = p_church_id;

  DELETE FROM churches WHERE id = p_church_id;
END;
$$;

REVOKE ALL ON FUNCTION purge_church(UUID) FROM PUBLIC;
-- service-role bypasses GRANTs; intentionally not granted to authenticated.


-- ============================================================
-- PART E — delete_dropped_ai_widgets(uuid)  [service-role only]
-- ============================================================
-- Drops the church's non-starter, church-scope widgets (the AI-built
-- library). Seeded starters and per-user private widgets are kept.
-- dashboard_widgets rows cascade via their widget_id FK (ON DELETE CASCADE).
-- ============================================================
CREATE OR REPLACE FUNCTION delete_dropped_ai_widgets(p_church_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH del AS (
    DELETE FROM widgets
     WHERE church_id = p_church_id
       AND scope = 'church'
       AND is_starter = false
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION delete_dropped_ai_widgets(UUID) FROM PUBLIC;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- churches: + expired_at, deleted_at, widget_retention_at (+ 3 partial idx)
-- functions: _wipe_church_content, reset_church_data (owner, GRANT auth),
--            purge_church (service-role), delete_dropped_ai_widgets (service-role)
-- No god-node schema change. Review, then apply on a Supabase branch first.
-- ============================================================
