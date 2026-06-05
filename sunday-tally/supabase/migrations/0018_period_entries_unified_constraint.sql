-- ============================================================
-- Sunday Tally — Period Entries: unified NULLS NOT DISTINCT constraint
-- Migration: 0018_period_entries_unified_constraint.sql
--
-- Migration 0014 replaced the single unique constraint with two
-- partial indexes (tagged / untagged). PostgREST's upsert cannot
-- use partial indexes for ON CONFLICT resolution, causing Stage B
-- imports to error on church_period_entries rows where
-- service_tag_id IS NULL.
--
-- Fix: drop the partial indexes, add a single unique constraint
-- using NULLS NOT DISTINCT (PostgreSQL 15+) so that two untagged
-- rows for the same church/category/period still collide correctly.
-- ============================================================

-- Drop the partial indexes from migration 0014
DROP INDEX IF EXISTS uq_period_entry_tagged;
DROP INDEX IF EXISTS uq_period_entry_untagged;

-- Drop any leftover old constraint (migration 0014 already did this,
-- but guard against partially-applied states)
ALTER TABLE church_period_entries
  DROP CONSTRAINT IF EXISTS uq_period_entry;

-- Add unified unique constraint; NULL service_tag_id treated as equal
-- so two church-wide rows with the same period key will conflict
ALTER TABLE church_period_entries
  ADD CONSTRAINT uq_period_entry
  UNIQUE NULLS NOT DISTINCT (church_id, service_tag_id, response_category_id, entry_period_type, period_date);
