-- ============================================================
-- Sunday Tally — Period Entries: nullable service_tag_id
-- Migration: 0014_period_entries_nullable_tag.sql
--
-- Allows church-wide period stats with no specific audience or
-- service tag. NULL service_tag_id = church-wide (untagged) entry.
--
-- Previously service_tag_id was NOT NULL, which prevented storing
-- stats like "total weekly decisions" that aren't scoped to a
-- specific audience (MAIN / KIDS / YOUTH) or service.
-- ============================================================


-- Step 1: Drop the existing UNIQUE constraint (includes service_tag_id)
ALTER TABLE church_period_entries
  DROP CONSTRAINT IF EXISTS uq_period_entry;


-- Step 2: Allow NULL on service_tag_id
ALTER TABLE church_period_entries
  ALTER COLUMN service_tag_id DROP NOT NULL;


-- Step 3: Recreate uniqueness as two partial indexes
--   PostgreSQL treats NULLs as distinct in standard unique indexes,
--   so two untagged rows for the same church/category/period would
--   not collide. Partial indexes enforce the correct behavior.

-- Tagged entries (audience or service tag present)
CREATE UNIQUE INDEX IF NOT EXISTS uq_period_entry_tagged
  ON church_period_entries (church_id, service_tag_id, response_category_id, entry_period_type, period_date)
  WHERE service_tag_id IS NOT NULL;

-- Untagged entries (church-wide, no audience split)
CREATE UNIQUE INDEX IF NOT EXISTS uq_period_entry_untagged
  ON church_period_entries (church_id, response_category_id, entry_period_type, period_date)
  WHERE service_tag_id IS NULL;


-- ============================================================
-- RESULT
--   church_period_entries.service_tag_id: nullable
--   NULL  → church-wide stat, no audience
--   MAIN  → main congregation stat
--   KIDS  → children's ministry stat
--   YOUTH → student ministry stat
--   MORNING / EVENING / etc → service-time-specific stat
-- ============================================================
