-- ============================================================
-- Migration 0053 — fix seed_starter_church_setup / seed_template2_church_setup
-- Bug: metrics.code is NOT NULL (0026_metrics_code.sql) but both
-- starter-template seed functions never populated it, so every
-- INSERT INTO metrics inside them throws:
--   null value in column "code" of relation "metrics" violates not-null constraint
-- The whole function call is one statement, so the error rolled back
-- the ENTIRE seed (tags, templates, schedules, everything) — churches
-- that hit this got a completely bare setup, silently, because the
-- caller (src/app/onboarding/start/actions.ts) treats the RPC as
-- non-fatal and just shows a generic retry message.
--
-- Also: seed_starter_church_setup was hotfixed directly against
-- production twice (seed_starter_church_setup_v2, _v3 — 2026-06-30/
-- 2026-07-01) with no matching local migration file, and neither
-- hotfix actually fixed the code bug. This migration reconciles the
-- repo with what's live (body matches v3) and fixes the bug. It also
-- fixes seed_template2_church_setup (0050), which shipped with the
-- same bug and has not yet been exercised by a real signup.
--
-- code convention (matches AI-importer-authored metrics elsewhere,
-- e.g. ADULT_ADULT_ATTENDANCE, KIDS_KIDS_ATTENDANCE in prod data):
--   {ministry_tag.code}_{UPPER_SNAKE(metric name)}
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
    -- Sunday School: Adult + Kids + Youth (3 simultaneous tracks)
    (p_church_id, v_tmpl_ss_id,  v_adult_tag_id, 0),
    (p_church_id, v_tmpl_ss_id,  v_kids_tag_id,  1),
    (p_church_id, v_tmpl_ss_id,  v_youth_tag_id, 2),
    -- Sunday Morning: Adult + Youth (youth attends main service, rolls up with adults)
    (p_church_id, v_tmpl_am_id,  v_adult_tag_id, 0),
    (p_church_id, v_tmpl_am_id,  v_youth_tag_id, 1),
    -- Sunday Evening: Adult + Youth
    (p_church_id, v_tmpl_pm_id,  v_adult_tag_id, 0),
    (p_church_id, v_tmpl_pm_id,  v_youth_tag_id, 1),
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
    (church_id, name, code, ministry_tag_id, reporting_tag_id, scope, cadence, is_canonical, is_active, counted_demographic)
  VALUES
    -- Adult Ministry — instance
    (p_church_id, 'Adult Attendance',          'ADULT_MINISTRY_ADULT_ATTENDANCE',        v_adult_tag_id, v_rt_attendance, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Adult Volunteers',          'ADULT_MINISTRY_ADULT_VOLUNTEERS',        v_adult_tag_id, v_rt_volunteers, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Hands Raised / Salvations', 'ADULT_MINISTRY_HANDS_RAISED_SALVATIONS', v_adult_tag_id, v_rt_response,   'instance', NULL,    true, true, NULL),
    -- Adult Ministry — period
    (p_church_id, 'Weekly Giving',             'ADULT_MINISTRY_WEEKLY_GIVING',           v_adult_tag_id, v_rt_giving,     'period',   'week',  true, true, NULL),
    (p_church_id, 'Baptisms',                  'ADULT_MINISTRY_BAPTISMS',                v_adult_tag_id, v_rt_baptisms,   'period',   'month', true, true, NULL),
    -- Kids Ministry — kids attendance, adult volunteers (teachers)
    (p_church_id, 'Kids Attendance',           'KIDS_KIDS_ATTENDANCE',                   v_kids_tag_id,  v_rt_attendance, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Kids Volunteers',           'KIDS_KIDS_VOLUNTEERS',                   v_kids_tag_id,  v_rt_volunteers, 'instance', NULL,    true, true, 'ADULT_SERVICE'::tag_role),
    -- Youth Ministry — student attendance, adult volunteers (leaders)
    (p_church_id, 'Student Attendance',        'YOUTH_STUDENT_ATTENDANCE',               v_youth_tag_id, v_rt_attendance, 'instance', NULL,    true, true, NULL),
    (p_church_id, 'Youth Volunteers',          'YOUTH_YOUTH_VOLUNTEERS',                 v_youth_tag_id, v_rt_volunteers, 'instance', NULL,    true, true, 'ADULT_SERVICE'::tag_role)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_starter_church_setup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_starter_church_setup(UUID) TO authenticated;

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
    (p_church_id, 'Adult Ministry', 'ADULT_MINISTRY', 'ADULT_SERVICE',  false, 1, true),
    (p_church_id, 'Kids Ministry',  'KIDS',         'KIDS_MINISTRY',  false, 2, true),
    (p_church_id, 'Youth Ministry', 'YOUTH',        'YOUTH_MINISTRY', false, 3, true),
    (p_church_id, 'Church-Wide',    'CHURCH_WIDE',  'OTHER',          false, 4, true)
  ON CONFLICT (church_id, code) DO NOTHING;

  SELECT id INTO v_main_tag_id  FROM service_tags WHERE church_id = p_church_id AND code = 'ADULT_MINISTRY';
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
    (church_id, name, code, ministry_tag_id, reporting_tag_id, scope, cadence, is_canonical, is_active, counted_demographic)
  VALUES
    -- Main Service — instance
    (p_church_id, 'Adult Attendance', 'ADULT_MINISTRY_ADULT_ATTENDANCE', v_main_tag_id,  v_rt_attendance, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Adult Volunteers', 'ADULT_MINISTRY_ADULT_VOLUNTEERS', v_main_tag_id,  v_rt_volunteers, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Salvations',       'ADULT_MINISTRY_SALVATIONS',       v_main_tag_id,  v_rt_response,   'instance', NULL,   true, true, NULL),
    -- Kids Ministry (volunteers are adults/teachers serving kids)
    (p_church_id, 'Kids Attendance',  'KIDS_KIDS_ATTENDANCE',            v_kids_tag_id,  v_rt_attendance, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Kids Volunteers',  'KIDS_KIDS_VOLUNTEERS',            v_kids_tag_id,  v_rt_volunteers, 'instance', NULL,   true, true, 'ADULT_SERVICE'::tag_role),
    -- Youth Ministry (volunteers are adult leaders)
    (p_church_id, 'Youth Attendance', 'YOUTH_YOUTH_ATTENDANCE',          v_youth_tag_id, v_rt_attendance, 'instance', NULL,   true, true, NULL),
    (p_church_id, 'Youth Volunteers', 'YOUTH_YOUTH_VOLUNTEERS',          v_youth_tag_id, v_rt_volunteers, 'instance', NULL,   true, true, 'ADULT_SERVICE'::tag_role),
    (p_church_id, 'Decisions',        'YOUTH_DECISIONS',                 v_youth_tag_id, v_rt_response,   'instance', NULL,   true, true, NULL),
    -- Church-Wide: giving not tied to one ministry
    (p_church_id, 'Weekly Giving',    'CHURCH_WIDE_WEEKLY_GIVING',       v_cwide_tag_id, v_rt_giving,     'period',   'week', true, true, NULL)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_template2_church_setup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_template2_church_setup(UUID) TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE
-- Fixed: seed_starter_church_setup, seed_template2_church_setup
--   Both now populate metrics.code (NOT NULL since 0026), using the
--   {ministry_tag.code}_{UPPER_SNAKE(name)} convention already used
--   elsewhere in the app (e.g. KIDS_KIDS_ATTENDANCE).
-- Reconciles repo with production: seed_starter_church_setup body now
-- matches what was live as seed_starter_church_setup_v3 (applied
-- directly to prod 2026-07-01, no local file); the code bug persisted
-- through v1/v2/v3, so no functional behavior beyond this fix is lost.
-- ============================================================
