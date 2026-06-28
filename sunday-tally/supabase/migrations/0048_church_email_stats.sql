-- ============================================================
-- Migration 0048 — church_email_stats(uuid)
-- STATUS: applied 2026-06-27. Read-only helper.
-- ============================================================
-- WHY
--   Lifecycle/trial emails show each church its own value numbers
--   ("221 weeks tracked · 87,982 attendances · $X giving"). The crons run
--   on the service role; this STABLE SECURITY DEFINER function returns the
--   per-church aggregates in one round trip (PostgREST can't sum/distinct
--   from the JS client reliably). Giving is stored in whole dollars.
-- ============================================================

CREATE OR REPLACE FUNCTION church_email_stats(p_church_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'servicesLogged', (SELECT count(*) FROM service_instances WHERE church_id = p_church_id AND status = 'active'),
    'weeksTracked',   (SELECT count(DISTINCT date_trunc('week', service_date)) FROM service_instances WHERE church_id = p_church_id),
    'attendance',     COALESCE((SELECT sum(value) FROM metric_entries WHERE church_id = p_church_id AND reporting_tag_code = 'ATTENDANCE'), 0),
    'giving',         COALESCE((SELECT sum(value) FROM metric_entries WHERE church_id = p_church_id AND reporting_tag_code = 'GIVING'), 0),
    'volunteers',     COALESCE((SELECT sum(value) FROM metric_entries WHERE church_id = p_church_id AND reporting_tag_code = 'VOLUNTEERS'), 0)
  );
$$;

REVOKE ALL ON FUNCTION church_email_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church_email_stats(UUID) TO authenticated;
