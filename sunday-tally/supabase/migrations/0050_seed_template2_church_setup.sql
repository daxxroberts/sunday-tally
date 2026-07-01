-- ============================================================
-- Migration 0050 — seed_template2_church_setup
-- Template 2: "Multi-Service Church"
-- Based on Demo Church structure.
-- 4 ministries, 3 services, 9 metrics. Called on-demand from
-- /onboarding/start when user picks Template 2 — non-fatal.
-- ============================================================
-- Template structure:
--   Ministries:  Main Service · Kids Ministry · Youth Ministry · Church-Wide
--   Services:    First Service  (9:00 AM, Sun)  — Main + Kids
--                Second Service (10:30 AM, Sun)  — Main + Kids
--                Youth Night    (6:30 PM, Wed)   — Youth only
--   Metrics:
--     Main Service  → attendance · volunteers · salvations (instance)
--     Kids Ministry → kids attendance · kids volunteers/adult (instance)
--     Youth Ministry→ youth attendance · youth volunteers/adult · decisions (instance)
--     Church-Wide   → weekly giving (period/week)
-- ============================================================

CREATE OR REPLACE FUNCTION seed_template2_church_setup(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_tag_id    UUID;
  v_kids_tag_id    UUID;
  v_youth_tag_id   UUID;
  v_cwide_tag_id   UUID;
  v_location_id    UUID;
  v_tmpl_first_id  UUID;
  v_tmpl_second_id UUID;
  v_tmpl_youth_id  UUID;
  v_rt_attendance  UUID;
  v_rt_volunteers  UUID;
  v_rt_giving      UUID;
  v_rt_response    UUID;
  v_next_sunday    DATE;
  v_next_wednesday DATE;
BEGIN
  -- Guard: skip if this church already has templates
  IF EXISTS (SELECT 1 FROM service_templates WHERE church_id = p_church_id AND is_active = true) THEN
    RETURN;
  END IF;

  -- ── 1. Ministry tags ────────────────────────────────────────
  INSERT INTO service_tags (church_id, name, code, tag_role, is_custom, display_order, is_active)
  VALUES
    (p_church_id, 'Main Service',   'MAIN_SERVICE', 'ADULT_SERVICE',  false, 1, true),
    (p_church_id, 'Kids Ministry',  'KIDS',         'KIDS_MINISTRY',  false, 2, true),
    (p_church_id, 'Youth Ministry', 'YOUTH',        'YOUTH_MINISTRY', false, 3, true),
    (p_church_id, 'Church-Wide',    'CHURCH_WIDE',  'OTHER',          false, 4, true)
  ON CONFLICT (church_id, code) DO NOTHING;

  SELECT id INTO v_main_tag_id  FROM service_tags WHERE church_id = p_church_id AND code = 'MAIN_SERVICE';
  SELECT id INTO v_kids_tag_id  FROM service_tags WHERE church_id = p_church_id AND code = 'KIDS';
  SELECT id INTO v_youth_tag_id FROM service_tags WHERE church_id = p_church_id AND code = 'YOUTH';
  SELECT id INTO v_cwide_tag_id FROM service_tags WHERE church_id = p_church_id AND code = 'CHURCH_WIDE';

  -- First active location (the default "Main Campus" from signup)
  SELECT id INTO v_location_id FROM church_locations
   WHERE church_id = p_church_id AND is_active = true ORDER BY sort_order ASC LIMIT 1;

  IF v_main_tag_id IS NULL OR v_location_id IS NULL THEN RETURN; END IF;

  -- ── 2. Next Sunday and next Wednesday (never today) ─────────
  v_next_sunday := CURRENT_DATE + CASE
    WHEN EXTRACT(DOW FROM CURRENT_DATE)::int = 0 THEN 7
    ELSE 7 - EXTRACT(DOW FROM CURRENT_DATE)::int
  END;

  v_next_wednesday := CURRENT_DATE + CASE
    WHEN EXTRACT(DOW FROM CURRENT_DATE)::int = 3 THEN 7
    WHEN EXTRACT(DOW FROM CURRENT_DATE)::int <  3 THEN 3 - EXTRACT(DOW FROM CURRENT_DATE)::int
    ELSE 10 - EXTRACT(DOW FROM CURRENT_DATE)::int
  END;

  -- ── 3. Service templates ────────────────────────────────────
  INSERT INTO service_templates (church_id, service_code, display_name, location_id, sort_order, primary_tag_id, is_active)
  VALUES
    (p_church_id, 'SUNDAY_FIRST',  'First Service',  v_location_id, 1, v_main_tag_id,  true),
    (p_church_id, 'SUNDAY_SECOND', 'Second Service', v_location_id, 2, v_main_tag_id,  true),
    (p_church_id, 'YOUTH_NIGHT',   'Youth Night',    v_location_id, 3, v_youth_tag_id, true)
  ON CONFLICT (church_id, location_id, service_code) DO NOTHING;

  SELECT id INTO v_tmpl_first_id  FROM service_templates WHERE church_id = p_church_id AND service_code = 'SUNDAY_FIRST'  AND is_active = true;
  SELECT id INTO v_tmpl_second_id FROM service_templates WHERE church_id = p_church_id AND service_code = 'SUNDAY_SECOND' AND is_active = true;
  SELECT id INTO v_tmpl_youth_id  FROM service_templates WHERE church_id = p_church_id AND service_code = 'YOUTH_NIGHT'   AND is_active = true;

  -- ── 4. Ministry composition ─────────────────────────────────
  INSERT INTO service_template_tags (church_id, service_template_id, ministry_tag_id, sort_order)
  VALUES
    -- First Service: Main + Kids (same tracks run simultaneously)
    (p_church_id, v_tmpl_first_id,  v_main_tag_id,  0),
    (p_church_id, v_tmpl_first_id,  v_kids_tag_id,  1),
    -- Second Service: same composition repeats
    (p_church_id, v_tmpl_second_id, v_main_tag_id,  0),
    (p_church_id, v_tmpl_second_id, v_kids_tag_id,  1),
    -- Youth Night: youth ministry meets separately mid-week
    (p_church_id, v_tmpl_youth_id,  v_youth_tag_id, 0)
  ON CONFLICT (service_template_id, ministry_tag_id) DO NOTHING;

  -- ── 5. Schedule versions ─────────────────────────────────────
  INSERT INTO service_schedule_versions (service_template_id, effective_start_date, day_of_week, start_time, frequency)
  VALUES
    (v_tmpl_first_id,  v_next_sunday,    0, '09:00', 'specific'),
    (v_tmpl_second_id, v_next_sunday,    0, '10:30', 'specific'),
    (v_tmpl_youth_id,  v_next_wednesday, 3, '18:30', 'specific')
  ON CONFLICT (service_template_id, effective_start_date) DO NOTHING;

  -- ── 6. Resolve system reporting tag IDs ─────────────────────
  SELECT id INTO v_rt_attendance FROM reporting_tags WHERE church_id = p_church_id AND code = 'ATTENDANCE';
  SELECT id INTO v_rt_volunteers FROM reporting_tags WHERE church_id = p_church_id AND code = 'VOLUNTEERS';
  SELECT id INTO v_rt_giving     FROM reporting_tags WHERE church_id = p_church_id AND code = 'GIVING';
  SELECT id INTO v_rt_response   FROM reporting_tags WHERE church_id = p_church_id AND code = 'RESPONSE_STAT';

  -- ── 7. Metrics ───────────────────────────────────────────────
  INSERT INTO metrics
    (church_id, name, ministry_tag_id, reporting_tag_id, scope, cadence, is_canonical, is_active, counted_demographic)
  VALUES
    -- Main Service — instance
    (p_church_id, 'Adult Attendance', v_main_tag_id,  v_rt_attendance, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Volunteers',       v_main_tag_id,  v_rt_volunteers, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Salvations',       v_main_tag_id,  v_rt_response,   'instance', NULL,   true, true, NULL),
    -- Kids Ministry (volunteers are adults/teachers serving kids)
    (p_church_id, 'Kids Attendance',  v_kids_tag_id,  v_rt_attendance, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Kids Volunteers',  v_kids_tag_id,  v_rt_volunteers, 'instance', NULL,   true, true, 'ADULT_SERVICE'::tag_role),
    -- Youth Ministry (volunteers are adult leaders)
    (p_church_id, 'Youth Attendance', v_youth_tag_id, v_rt_attendance, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Youth Volunteers', v_youth_tag_id, v_rt_volunteers, 'instance', NULL,   true, true, 'ADULT_SERVICE'::tag_role),
    (p_church_id, 'Decisions',        v_youth_tag_id, v_rt_response,   'instance', NULL,   true, true, NULL),
    -- Church-Wide: giving not tied to one ministry
    (p_church_id, 'Weekly Giving',    v_cwide_tag_id, v_rt_giving,     'period',   'week', true, true, NULL)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_template2_church_setup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_template2_church_setup(UUID) TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE
-- New function: seed_template2_church_setup(UUID)
--   Ministry tags: Main Service  (MAIN_SERVICE/ADULT_SERVICE)
--                  Kids Ministry (KIDS/KIDS_MINISTRY)
--                  Youth Ministry(YOUTH/YOUTH_MINISTRY)
--                  Church-Wide   (CHURCH_WIDE/OTHER — giving only)
--   Services:   First Service  (Sun 9:00 AM) — Main + Kids
--               Second Service (Sun 10:30 AM) — Main + Kids
--               Youth Night    (Wed 6:30 PM) — Youth only
--   Metrics:
--     Main: attendance · volunteers · salvations
--     Kids: kids attendance · adult volunteers/teachers
--     Youth: youth attendance · adult volunteers/leaders · decisions
--     Church-Wide: weekly giving (period/week)
-- ============================================================
