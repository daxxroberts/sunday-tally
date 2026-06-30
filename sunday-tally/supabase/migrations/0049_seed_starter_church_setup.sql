-- ============================================================
-- Migration 0049 — seed_starter_church_setup
-- Full default church template: 3 ministries, 4 services,
-- schedules, and metrics. Called at signup — non-fatal.
-- ============================================================
-- Template structure:
--   Ministry tags:   Adult Ministry · Kids Ministry · Youth Ministry
--   Services:        Sunday School (9:30 AM, Sun)
--                    Sunday Morning (10:30 AM, Sun)
--                    Sunday Evening (5:00 PM, Sun)
--                    Wednesday Night (5:00 PM, Wed)
--   Metrics:
--     Adult Ministry   → attendance · volunteers · hands raised/salvations (instance)
--                        weekly giving · monthly baptisms (period)
--     Kids Ministry    → kids attendance · adult volunteers/teachers (instance)
--     Youth Ministry   → student attendance · adult volunteers/leaders (instance)
-- ============================================================

CREATE OR REPLACE FUNCTION seed_starter_church_setup(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adult_tag_id   UUID;
  v_kids_tag_id    UUID;
  v_youth_tag_id   UUID;
  v_location_id    UUID;
  v_tmpl_ss_id     UUID;
  v_tmpl_am_id     UUID;
  v_tmpl_pm_id     UUID;
  v_tmpl_wed_id    UUID;
  v_rt_attendance  UUID;
  v_rt_volunteers  UUID;
  v_rt_giving      UUID;
  v_rt_response    UUID;
  v_rt_baptisms    UUID;
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
    (p_church_id, 'Adult Ministry', 'ADULT_MINISTRY', 'ADULT_SERVICE',  false, 1, true),
    (p_church_id, 'Kids Ministry',  'KIDS',           'KIDS_MINISTRY',  false, 2, true),
    (p_church_id, 'Youth Ministry', 'YOUTH',          'YOUTH_MINISTRY', false, 3, true)
  ON CONFLICT (church_id, code) DO NOTHING;

  SELECT id INTO v_adult_tag_id FROM service_tags WHERE church_id = p_church_id AND code = 'ADULT_MINISTRY';
  SELECT id INTO v_kids_tag_id  FROM service_tags WHERE church_id = p_church_id AND code = 'KIDS';
  SELECT id INTO v_youth_tag_id FROM service_tags WHERE church_id = p_church_id AND code = 'YOUTH';

  -- First active location (the default "Main Campus" from signup step 3)
  SELECT id INTO v_location_id FROM church_locations
   WHERE church_id = p_church_id AND is_active = true ORDER BY sort_order ASC LIMIT 1;

  IF v_adult_tag_id IS NULL OR v_location_id IS NULL THEN RETURN; END IF;

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
    (p_church_id, 'SUNDAY_SCHOOL', 'Sunday School',   v_location_id, 1, v_adult_tag_id, true),
    (p_church_id, 'SUNDAY_AM',     'Sunday Morning',  v_location_id, 2, v_adult_tag_id, true),
    (p_church_id, 'SUNDAY_PM',     'Sunday Evening',  v_location_id, 3, v_adult_tag_id, true),
    (p_church_id, 'WED_NIGHT',     'Wednesday Night', v_location_id, 4, v_adult_tag_id, true)
  ON CONFLICT (church_id, location_id, service_code) DO NOTHING;

  SELECT id INTO v_tmpl_ss_id  FROM service_templates WHERE church_id = p_church_id AND service_code = 'SUNDAY_SCHOOL' AND is_active = true;
  SELECT id INTO v_tmpl_am_id  FROM service_templates WHERE church_id = p_church_id AND service_code = 'SUNDAY_AM'     AND is_active = true;
  SELECT id INTO v_tmpl_pm_id  FROM service_templates WHERE church_id = p_church_id AND service_code = 'SUNDAY_PM'     AND is_active = true;
  SELECT id INTO v_tmpl_wed_id FROM service_templates WHERE church_id = p_church_id AND service_code = 'WED_NIGHT'     AND is_active = true;

  -- ── 4. Ministry composition ─────────────────────────────────
  INSERT INTO service_template_tags (church_id, service_template_id, ministry_tag_id, sort_order)
  VALUES
    -- Sunday School: Adult + Kids + Youth
    (p_church_id, v_tmpl_ss_id,  v_adult_tag_id, 0),
    (p_church_id, v_tmpl_ss_id,  v_kids_tag_id,  1),
    (p_church_id, v_tmpl_ss_id,  v_youth_tag_id, 2),
    -- Sunday Morning: Adult only
    (p_church_id, v_tmpl_am_id,  v_adult_tag_id, 0),
    -- Sunday Evening: Adult only
    (p_church_id, v_tmpl_pm_id,  v_adult_tag_id, 0),
    -- Wednesday Night: Adult + Youth
    (p_church_id, v_tmpl_wed_id, v_adult_tag_id, 0),
    (p_church_id, v_tmpl_wed_id, v_youth_tag_id, 1)
  ON CONFLICT (service_template_id, ministry_tag_id) DO NOTHING;

  -- ── 5. Schedule versions ─────────────────────────────────────
  INSERT INTO service_schedule_versions (service_template_id, effective_start_date, day_of_week, start_time, frequency)
  VALUES
    (v_tmpl_ss_id,  v_next_sunday,    0, '09:30', 'specific'),
    (v_tmpl_am_id,  v_next_sunday,    0, '10:30', 'specific'),
    (v_tmpl_pm_id,  v_next_sunday,    0, '17:00', 'specific'),
    (v_tmpl_wed_id, v_next_wednesday, 3, '17:00', 'specific')
  ON CONFLICT (service_template_id, effective_start_date) DO NOTHING;

  -- ── 6. Custom BAPTISMS reporting tag ────────────────────────
  -- RESPONSE_STAT is already the system tag for hands raised.
  -- Baptisms gets its own tag so both can be canonical per-ministry.
  INSERT INTO reporting_tags (church_id, code, name, unit_kind, agg_default, is_system)
  VALUES (p_church_id, 'BAPTISMS', 'Baptisms', 'count', 'sum', false)
  ON CONFLICT (church_id, code) DO NOTHING;

  -- ── 7. Resolve reporting tag IDs ────────────────────────────
  SELECT id INTO v_rt_attendance FROM reporting_tags WHERE church_id = p_church_id AND code = 'ATTENDANCE';
  SELECT id INTO v_rt_volunteers FROM reporting_tags WHERE church_id = p_church_id AND code = 'VOLUNTEERS';
  SELECT id INTO v_rt_giving     FROM reporting_tags WHERE church_id = p_church_id AND code = 'GIVING';
  SELECT id INTO v_rt_response   FROM reporting_tags WHERE church_id = p_church_id AND code = 'RESPONSE_STAT';
  SELECT id INTO v_rt_baptisms   FROM reporting_tags WHERE church_id = p_church_id AND code = 'BAPTISMS';

  -- ── 8. Metrics ───────────────────────────────────────────────
  INSERT INTO metrics
    (church_id, name, ministry_tag_id, reporting_tag_id, scope, cadence, is_canonical, is_active, counted_demographic)
  VALUES
    -- Adult Ministry — instance
    (p_church_id, 'Adult Attendance',          v_adult_tag_id, v_rt_attendance, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Adult Volunteers',          v_adult_tag_id, v_rt_volunteers, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Hands Raised / Salvations', v_adult_tag_id, v_rt_response,   'instance', NULL,    true, true, NULL),
    -- Adult Ministry — period
    (p_church_id, 'Weekly Giving',             v_adult_tag_id, v_rt_giving,     'period',   'week',  true, true, NULL),
    (p_church_id, 'Baptisms',                  v_adult_tag_id, v_rt_baptisms,   'period',   'month', true, true, NULL),
    -- Kids Ministry — kids attendance, adult volunteers (teachers)
    (p_church_id, 'Kids Attendance',           v_kids_tag_id,  v_rt_attendance, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Kids Volunteers',           v_kids_tag_id,  v_rt_volunteers, 'instance', NULL,    true, true, 'ADULT_SERVICE'::tag_role),
    -- Youth Ministry — student attendance, adult volunteers (leaders)
    (p_church_id, 'Student Attendance',        v_youth_tag_id, v_rt_attendance, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Youth Volunteers',          v_youth_tag_id, v_rt_volunteers, 'instance', NULL,    true, true, 'ADULT_SERVICE'::tag_role)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_starter_church_setup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_starter_church_setup(UUID) TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE
-- Updated function: seed_starter_church_setup(UUID)
--   Ministry tags:  Adult Ministry (ADULT_MINISTRY/ADULT_SERVICE)
--                   Kids Ministry  (KIDS/KIDS_MINISTRY)
--                   Youth Ministry (YOUTH/YOUTH_MINISTRY)
--   Services:       Sunday School (Sun 9:30 AM) — 3 ministry tracks
--                   Sunday Morning (Sun 10:30 AM) — Adult
--                   Sunday Evening (Sun 5:00 PM) — Adult
--                   Wednesday Night (Wed 5:00 PM) — Adult + Youth
--   Metrics:
--     Adult: attendance · volunteers · hands raised (instance)
--            weekly giving · monthly baptisms (period)
--     Kids:  kids attendance · adult volunteers/teachers
--     Youth: student attendance · adult volunteers/leaders
-- ============================================================
