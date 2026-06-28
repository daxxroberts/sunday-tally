-- ============================================================
-- Migration 0047 — fix _wipe_church_content vs. system-tag protection
-- STATUS: applied with 0046 (trial lifecycle). Corrective.
-- ============================================================
-- WHY
--   reporting_tags carries a BEFORE DELETE/UPDATE trigger
--   (trg_protect_system_reporting_tags) that RAISES when is_system = true.
--   Every real church has is_system system reporting tags, so the
--   reporting_tags delete inside _wipe_church_content raised — which means
--   reset_church_data() and purge_church() would FAIL on any real church.
--   (It also silently cancels non-system deletes by returning NEW on DELETE,
--    leaving orphans.) Caught by a synthetic purge test before any real use.
--
-- FIX
--   A full church wipe must remove EVERY reporting tag. Bypass the protect
--   trigger for just that scoped delete (the function is SECURITY DEFINER and
--   owns the table), re-enabling it even on error. No change to the trigger's
--   user-facing protection.
-- ============================================================

CREATE OR REPLACE FUNCTION _wipe_church_content(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM metric_entries        WHERE church_id = p_church_id;
  DELETE FROM service_template_tags WHERE church_id = p_church_id;
  DELETE FROM service_schedule_versions
    WHERE service_template_id IN (SELECT id FROM service_templates WHERE church_id = p_church_id);
  DELETE FROM service_instances WHERE church_id = p_church_id;
  DELETE FROM dashboard_widgets WHERE church_id = p_church_id;
  DELETE FROM dashboards        WHERE church_id = p_church_id;
  DELETE FROM widgets           WHERE church_id = p_church_id;
  DELETE FROM metrics        WHERE church_id = p_church_id;

  -- reporting_tags: bypass the system-tag protect trigger for this scoped,
  -- privileged wipe only. Re-enable even if the delete fails.
  BEGIN
    ALTER TABLE reporting_tags DISABLE TRIGGER trg_protect_system_reporting_tags;
    DELETE FROM reporting_tags WHERE church_id = p_church_id;
    ALTER TABLE reporting_tags ENABLE TRIGGER trg_protect_system_reporting_tags;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE reporting_tags ENABLE TRIGGER trg_protect_system_reporting_tags;
    RAISE;
  END;

  DELETE FROM service_templates WHERE church_id = p_church_id;
  DELETE FROM service_groups    WHERE church_id = p_church_id;
  DELETE FROM service_tags WHERE church_id = p_church_id;
  UPDATE church_memberships SET default_location_id = NULL WHERE church_id = p_church_id;
  DELETE FROM church_membership_locations
    WHERE membership_id IN (SELECT id FROM church_memberships WHERE church_id = p_church_id);
  DELETE FROM church_locations WHERE church_id = p_church_id;
  DELETE FROM import_jobs WHERE church_id = p_church_id;
END;
$$;

REVOKE ALL ON FUNCTION _wipe_church_content(UUID) FROM PUBLIC;
