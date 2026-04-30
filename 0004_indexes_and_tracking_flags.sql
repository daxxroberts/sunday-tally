-- ============================================================
-- Church Analytics — Performance Indexes + Church Tracking Flags
-- Migration: 0004_indexes_and_tracking_flags.sql
-- Generated: 2026-04-09
-- Reviewed: ATLAS · FAULT · NOVA · SAGE
-- ============================================================
-- Covers two requirements from full team review:
--   [1] Missing indexes on entry tables — required before P12 production (F14)
--   [2] Per-church tracking configuration — D-025
-- ============================================================


-- ============================================================
-- PART 1 — Performance Indexes
-- Required before P12 (Recent Services with Completion Status)
-- goes to production. P12 fires EXISTS subqueries on all four
-- entry tables per occurrence row. Without these indexes, that
-- query degrades linearly as data grows.
-- ============================================================

-- attendance_entries already has uq_attendance_per_occurrence on
-- service_occurrence_id but no explicit index for lookup performance.
CREATE INDEX idx_attendance_occurrence
  ON attendance_entries (service_occurrence_id);

-- volunteer_entries has uq_volunteer_entry on
-- (service_occurrence_id, volunteer_category_id) — covers EXISTS.
-- Add explicit single-column index for EXISTS-only lookups.
CREATE INDEX idx_volunteer_entries_occurrence
  ON volunteer_entries (service_occurrence_id);

-- response_entries has uq_response_entry on
-- (service_occurrence_id, response_category_id) — covers EXISTS.
-- 0003 already created idx_response_entries_occurrence; guard for fresh deploys.
CREATE INDEX IF NOT EXISTS idx_response_entries_occurrence
  ON response_entries (service_occurrence_id);

-- giving_entries already has idx_giving_occurrence — no action needed.


-- ============================================================
-- PART 2 — Per-Church Tracking Flags
-- Decision D-025: Tracking is configurable per church at setup.
-- Attendance is always tracked — no flag (it is the core metric).
-- Volunteers, responses, and giving are optional modules.
-- Default true — churches that don't configure get full tracking.
-- ============================================================

ALTER TABLE churches
  ADD COLUMN tracks_volunteers BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN tracks_responses  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN tracks_giving     BOOLEAN NOT NULL DEFAULT true;

-- COMMENT: tracks_attendance intentionally omitted.
-- Attendance is the primary metric and cannot be disabled.
-- tracks_volunteers = false → T3 hidden, volunteer sections not shown
-- tracks_responses  = false → T4 hidden, response sections not shown
-- tracks_giving     = false → T5 hidden, giving sections not shown
-- "Complete" = all tracks_* = true sections have data entered.


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New indexes:  3 (attendance, volunteer, response occurrence lookup)
-- Schema change: 3 columns added to churches table
-- ============================================================
-- Schema now: 14 tables · 14 RLS policies · 10 indexes · 15 triggers
-- ============================================================
-- Downstream impact:
--   P12 completion logic must check tracks_* flags before
--   evaluating EXISTS on each entry table.
--   Occurrence dashboard (T1b) must hide opted-out sections.
--   T3/T4/T5 must check church tracking flags on load.
--   Setup flow (T6 area) must include tracking preference step.
-- ============================================================
