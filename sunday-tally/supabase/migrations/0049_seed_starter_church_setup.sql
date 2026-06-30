-- ============================================================
-- Migration 0049 — seed_starter_church_setup
-- Seeds default ministry tags + a starter service template so new
-- churches arrive at the services onboarding step with a pre-filled
-- form to edit rather than a blank, unpassable screen.
-- Called at signup (step 5) via service role — non-fatal.
-- ============================================================

CREATE OR REPLACE FUNCTION seed_starter_church_setup(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_tag_id UUID;
  v_location_id UUID;
  v_template_id UUID;
BEGIN
  -- 1. Default ministry tags — idempotent on (church_id, code)
  INSERT INTO service_tags
    (church_id, name, code, tag_role, is_custom, display_order, is_active)
  VALUES
    (p_church_id, 'Main Service',   'MAIN_SVC', 'ADULT_SERVICE',  false, 1, true),
    (p_church_id, 'Kids Ministry',  'KIDS',     'KIDS_MINISTRY',  false, 2, true),
    (p_church_id, 'Youth Ministry', 'YOUTH',    'YOUTH_MINISTRY', false, 3, true)
  ON CONFLICT (church_id, code) DO NOTHING;

  -- 2. Resolve tag + location IDs
  SELECT id INTO v_main_tag_id
    FROM service_tags
   WHERE church_id = p_church_id AND code = 'MAIN_SVC' AND is_active = true;

  SELECT id INTO v_location_id
    FROM church_locations
   WHERE church_id = p_church_id AND is_active = true
   ORDER BY sort_order ASC
   LIMIT 1;

  -- 3. Starter service template — only if none exist yet
  IF v_main_tag_id IS NOT NULL
     AND v_location_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM service_templates
        WHERE church_id = p_church_id AND is_active = true
     )
  THEN
    INSERT INTO service_templates
      (church_id, service_code, display_name, location_id, sort_order, primary_tag_id, is_active)
    VALUES
      (p_church_id, 'SUNDAY_SVC', 'Sunday Service', v_location_id, 1, v_main_tag_id, true)
    RETURNING id INTO v_template_id;

    INSERT INTO service_template_tags
      (church_id, service_template_id, ministry_tag_id, sort_order)
    VALUES
      (p_church_id, v_template_id, v_main_tag_id, 0)
    ON CONFLICT (service_template_id, ministry_tag_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION seed_starter_church_setup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_starter_church_setup(UUID) TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE
-- New function: seed_starter_church_setup(UUID)
--   Inserts 3 ministry tags (MAIN_SVC/ADULT_SERVICE, KIDS/KIDS_MINISTRY,
--   YOUTH/YOUTH_MINISTRY) and one starter service template (Sunday Service)
--   linked to Main Service. Idempotent. Called at signup, non-fatal.
-- ============================================================
