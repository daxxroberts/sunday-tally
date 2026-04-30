-- ============================================================
-- Church Analytics — MAIN Attendance Tracking Toggle
-- Migration: 0015_main_attendance_toggle.sql
-- Generated: 2026-04-24
-- ============================================================
-- Context: 0005 intentionally omitted tracks_main_attendance on the
-- assumption that "main is always tracked." That assumption fails for
-- M3 churches (parallel experiences) and Kids/Youth-only ministries
-- where main attendance is either redundant with the per-experience
-- count or intentionally not aggregated.
--
-- Default true preserves current behavior. UI hides Main field when
-- false; T1 completion logic skips main when false.
-- ============================================================

ALTER TABLE churches
  ADD COLUMN tracks_main_attendance BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- Downstream impact:
--   T2 Attendance: Main input hidden when tracks_main_attendance=false
--   T1 Services card checklist: Main attendance dropped when false
--   T_HISTORY: Main sub-column hidden when false
--   T6B Settings/Tracking: new toggle alongside Kids/Youth audiences
-- ============================================================
