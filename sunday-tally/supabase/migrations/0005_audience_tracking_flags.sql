-- ============================================================
-- Church Analytics — Audience Group Tracking Flags
-- Migration: 0005_audience_tracking_flags.sql
-- Generated: 2026-04-09
-- Decision: D-029
-- ============================================================
-- Context: D-003 ruled attendance has no is_not_applicable flag.
-- That ruling holds at the per-occurrence level — if a service ran,
-- attendance data exists. It does not hold at the church level —
-- a church with no youth ministry should not track youth attendance.
--
-- D-025 pattern (tracks_volunteers/responses/giving) extended to
-- attendance audience groups. Main attendance always tracked.
-- ============================================================

ALTER TABLE churches
  ADD COLUMN tracks_kids_attendance   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN tracks_youth_attendance  BOOLEAN NOT NULL DEFAULT true;

-- tracks_main_attendance intentionally omitted.
-- Main attendance is the core metric — always tracked.
-- tracks_kids_attendance = false  → Kids field hidden in T2
-- tracks_youth_attendance = false → Youth field hidden in T2
-- Completion for attendance = main entered
--   AND (tracks_kids = false  OR kids entered)
--   AND (tracks_youth = false OR youth entered)

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Schema now: 14 tables · 14 RLS policies · 10 indexes
--             15 triggers · 5 migrations
-- churches table now has 5 tracking flags:
--   tracks_kids_attendance   (D-029)
--   tracks_youth_attendance  (D-029)
--   tracks_volunteers        (D-025)
--   tracks_responses         (D-025)
--   tracks_giving            (D-025)
-- ============================================================
-- Downstream impact:
--   T2: Show only tracked audience fields
--   T1b completion logic: updated (see QUERY_PATTERNS.md)
--   T6b Settings: expose audience flags alongside module flags
--   P12 completion logic: updated
--   D1/D2 dashboards: filter untracked audiences from averages
-- ============================================================
