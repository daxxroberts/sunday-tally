-- ============================================================
-- DATA FIX — Giving metric → weekly church-wide (demo church)
-- STATUS: NEEDS-APPROVAL — run MANUALLY. No migration dependency.
-- Spec: plan §E ("Giving fix = CONVERT, never link" — Daxx 2026-06-09:
-- "you wouldn't think 'I need to add Giving to services'").
-- ============================================================
-- WHAT: the demo "Giving" metric was imported mis-stamped:
--   reporting kind RESPONSE_STAT (should be GIVING — so it never feeds
--   giving_per_week / dashboard giving), scope 'instance' with no
--   service link (so it is unreachable from every entry screen).
-- This converts it to what it is: a WEEKLY, church-wide number —
--   scope='period', cadence='week', reporting kind GIVING.
-- Any existing instance-bound entries are converted to week-anchored
-- period entries (anchor = the instance's week Sunday). The whole
-- script is ONE transaction; a count mismatch ABORTS.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_church  uuid := '4037051e-52f5-4c22-a0f1-32e7b45aaff4';
  v_metric  uuid;
  v_giv_rt  uuid;
  v_cnt_before bigint; v_sum_before numeric;
  v_cnt_after  bigint; v_sum_after  numeric;
BEGIN
  SELECT m.id INTO STRICT v_metric
  FROM metrics m
  JOIN service_tags t ON t.id = m.ministry_tag_id
  WHERE m.church_id = v_church AND t.code = 'GIVING' AND m.name = 'Giving' AND m.is_active;

  SELECT id INTO STRICT v_giv_rt
  FROM reporting_tags WHERE church_id = v_church AND code = 'GIVING';

  SELECT count(*), COALESCE(sum(value), 0) INTO v_cnt_before, v_sum_before
  FROM metric_entries WHERE metric_id = v_metric;
  RAISE NOTICE 'BASELINE giving entries: % rows, sum %', v_cnt_before, v_sum_before;

  -- 1. Re-file the metric: weekly, church-wide, proper kind.
  UPDATE metrics
  SET reporting_tag_id = v_giv_rt,
      scope   = 'period',
      cadence = 'week'
  WHERE id = v_metric;

  -- 2. Convert any instance-bound entries to week-anchored period rows
  --    (anchor = Sunday of the instance's service week) + fix the
  --    denormalized reporting_tag_code. location stays church-wide (NULL).
  UPDATE metric_entries me
  SET period_anchor       = si.service_date - EXTRACT(DOW FROM si.service_date)::int,
      service_instance_id = NULL,
      reporting_tag_code  = 'GIVING',
      location_id         = NULL
  FROM service_instances si
  WHERE me.metric_id = v_metric
    AND me.service_instance_id = si.id;

  -- Entries that were already period-scoped just need the kind fixed.
  UPDATE metric_entries
  SET reporting_tag_code = 'GIVING'
  WHERE metric_id = v_metric AND reporting_tag_code <> 'GIVING';

  SELECT count(*), COALESCE(sum(value), 0) INTO v_cnt_after, v_sum_after
  FROM metric_entries WHERE metric_id = v_metric;
  RAISE NOTICE 'AFTER: % rows, sum %', v_cnt_after, v_sum_after;

  IF v_cnt_after <> v_cnt_before OR v_sum_after <> v_sum_before THEN
    RAISE EXCEPTION 'BASELINE MISMATCH (before % / %, after % / %) — ROLLING BACK',
      v_cnt_before, v_sum_before, v_cnt_after, v_sum_after;
  END IF;
END $$;

COMMIT;

-- Post-run manual checks (read-only):
--   • Entries → Stat Entries tab shows "Giving" with a weekly field.
--   • giving_per_week view returns the converted weeks (if any entries existed).
--   • The Giving ministry node no longer flags as an orphan.
