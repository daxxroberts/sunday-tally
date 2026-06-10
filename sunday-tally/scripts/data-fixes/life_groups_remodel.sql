-- ============================================================
-- DATA FIX — Life Groups remodel (demo church)
-- STATUS: NEEDS-APPROVAL — run MANUALLY, only AFTER migration 0036 is
-- applied (church-wide services). Explicit per-script authorization.
-- Spec: plan §D · IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md.
-- ============================================================
-- WHAT: groups are tracked weekly for the whole church — they should
-- never have been a campus service. This script:
--   1. creates ONE church-wide "Life Groups" service (the weekly anchor),
--   2. counts Tabors + Roberts there (NOT the rollup-only parent),
--   3. REPOINTS the old "Tabors Life Group" instances onto it
--      (history keeps its dates/values; location becomes church-wide),
--   4. retires the old per-group service.
-- NUMBERS: church totals + History identical (asserted below).
-- KNOWN CAVEAT (approved): campus-filtered AI widgets stop seeing the
-- old Tabors rows (they are church-wide now) — by design.
-- The whole script is ONE transaction; any baseline mismatch ABORTS.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_church   uuid := '4037051e-52f5-4c22-a0f1-32e7b45aaff4';
  v_lg_tag   uuid;  v_tabors_tag uuid;  v_roberts_tag uuid;
  v_old_tmpl uuid;  v_new_tmpl   uuid;
  v_cnt_before bigint;  v_sum_before numeric;
  v_cnt_after  bigint;  v_sum_after  numeric;
BEGIN
  -- ── resolve ───────────────────────────────────────────────
  SELECT id INTO STRICT v_lg_tag      FROM service_tags WHERE church_id = v_church AND code = 'LIFE_GROUPS' AND is_active;
  SELECT id INTO STRICT v_tabors_tag  FROM service_tags WHERE church_id = v_church AND code = 'TABORS'      AND is_active;
  SELECT id INTO STRICT v_roberts_tag FROM service_tags WHERE church_id = v_church AND code = 'ROBERTS'     AND is_active;
  SELECT id INTO STRICT v_old_tmpl    FROM service_templates
    WHERE church_id = v_church AND display_name = 'Tabors Life Group' AND is_active;

  -- ── baseline (all entries hanging off the old template) ───
  SELECT count(*), COALESCE(sum(me.value), 0) INTO v_cnt_before, v_sum_before
  FROM metric_entries me
  JOIN service_instances si ON si.id = me.service_instance_id
  WHERE si.service_template_id = v_old_tmpl;
  RAISE NOTICE 'BASELINE old template: % entries, sum %', v_cnt_before, v_sum_before;

  -- ── 1. church-wide Life Groups template (requires 0036) ───
  INSERT INTO service_templates
    (church_id, location_id, service_code, display_name, primary_tag_id, sort_order, is_active)
  VALUES
    (v_church, NULL, 'LIFE_GROUPS', 'Life Groups', v_lg_tag,
     (SELECT COALESCE(max(sort_order), 0) + 1 FROM service_templates WHERE church_id = v_church),
     true)
  RETURNING id INTO v_new_tmpl;

  -- ── 2. counted there: the GROUPS (parent is rollup-only) ──
  INSERT INTO service_template_tags (church_id, service_template_id, ministry_tag_id, sort_order)
  VALUES (v_church, v_new_tmpl, v_tabors_tag, 0),
         (v_church, v_new_tmpl, v_roberts_tag, 1);

  -- ── 3. weekly anchor schedule (Sunday = the week); retire old ──
  INSERT INTO service_schedule_versions
    (service_template_id, day_of_week, start_time, effective_start_date, is_active)
  VALUES (v_new_tmpl, 0, '10:00', CURRENT_DATE, true);

  UPDATE service_schedule_versions
  SET is_active = false, effective_end_date = CURRENT_DATE
  WHERE service_template_id = v_old_tmpl AND is_active;

  -- ── 4. repoint history (new template has zero instances → no
  --       collision with uq_service_instance_churchwide) ──────
  UPDATE service_instances
  SET service_template_id = v_new_tmpl, location_id = NULL
  WHERE service_template_id = v_old_tmpl;

  UPDATE metric_entries
  SET location_id = NULL
  WHERE service_instance_id IN
    (SELECT id FROM service_instances WHERE service_template_id = v_new_tmpl);

  -- ── 5. retire the old per-group service (junction rows KEPT) ──
  UPDATE service_templates SET is_active = false WHERE id = v_old_tmpl;

  -- ── assert: identical entries under the new template ──────
  SELECT count(*), COALESCE(sum(me.value), 0) INTO v_cnt_after, v_sum_after
  FROM metric_entries me
  JOIN service_instances si ON si.id = me.service_instance_id
  WHERE si.service_template_id = v_new_tmpl;
  RAISE NOTICE 'AFTER new template: % entries, sum %', v_cnt_after, v_sum_after;

  IF v_cnt_after <> v_cnt_before OR v_sum_after <> v_sum_before THEN
    RAISE EXCEPTION 'BASELINE MISMATCH (before % / %, after % / %) — ROLLING BACK',
      v_cnt_before, v_sum_before, v_cnt_after, v_sum_after;
  END IF;
END $$;

COMMIT;

-- Post-run manual checks (read-only):
--   • Entries (any campus, current week) shows "Life Groups" with Tabors + Roberts sections.
--   • Services page: "Life Groups" under Church-wide; "Tabors Life Group" gone.
--   • Dashboard Life Groups roll-up card unchanged; History Tabors column unchanged.
