-- ============================================================
-- Church Analytics — Remove 'special' Status from V1
-- Migration: 0002_remove_special_status.sql
-- Generated: 2026-04-09
-- Decision: SPAN B2 — no UI path exists for 'special' in V1.
-- Schema and feature must ship together. Add back in V2
-- alongside the special event creation flow.
-- ============================================================

ALTER TABLE service_occurrences
  DROP CONSTRAINT service_occurrences_status_check;

ALTER TABLE service_occurrences
  ADD CONSTRAINT service_occurrences_status_check
  CHECK (status IN ('active', 'cancelled'));

-- ============================================================
-- V2 NOTE:
-- When special event flow is designed and built, restore with:
--   ALTER TABLE service_occurrences
--     DROP CONSTRAINT service_occurrences_status_check;
--   ALTER TABLE service_occurrences
--     ADD CONSTRAINT service_occurrences_status_check
--     CHECK (status IN ('active', 'cancelled', 'special'));
-- Ship this migration with the special event UI — not before.
-- ============================================================
