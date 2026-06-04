-- Phase 5: Reboot everything for tags
-- Drop legacy 'audience_group_code' from the entire schema.

-- 1. volunteer_categories
ALTER TABLE volunteer_categories ADD COLUMN primary_tag_id UUID REFERENCES service_tags(id) ON DELETE SET NULL;

-- Since this is dummy data, we can just drop the old column without migrating it carefully.
ALTER TABLE volunteer_categories DROP COLUMN audience_group_code;

-- 2. response_categories
-- It currently has stat_scope which might be 'audience'. We don't drop the column, we just won't use 'audience' going forward.
ALTER TABLE response_categories ADD COLUMN primary_tag_id UUID REFERENCES service_tags(id) ON DELETE SET NULL;

-- 3. response_entries
-- It has a unique constraint: uq_response_entry_service_level (service_instance_id, response_category_id, audience_group_code)
-- We need to drop the constraint and the column.
ALTER TABLE response_entries DROP CONSTRAINT IF EXISTS uq_response_entry_service_level;
ALTER TABLE response_entries DROP COLUMN IF EXISTS audience_group_code;

-- Add a new unique constraint without audience_group_code
ALTER TABLE response_entries ADD CONSTRAINT uq_response_entry_service_level UNIQUE (service_instance_id, response_category_id);

-- 4. church_period_entries
-- We need to check if it has audience_group_code or similar.
-- According to grep, period stats had audience_group_code, but let's check.
-- "church_period_entries DROP COLUMN audience_group_code"
ALTER TABLE church_period_entries DROP CONSTRAINT IF EXISTS uq_period_entry;
ALTER TABLE church_period_entries DROP COLUMN IF EXISTS audience_group_code;

-- Assuming unique constraint was: church_id, entry_date, category_type, category_id, audience_group_code
-- Let's re-add it without audience:
-- Actually, the old constraint in 0018_period_entries_unified_constraint.sql was:
-- UNIQUE (church_id, entry_date, category_type, category_id, COALESCE(audience_group_code, 'NONE'), COALESCE(tag_id, '00000000-0000-0000-0000-000000000000'))
-- So we drop it and create a new one:
ALTER TABLE church_period_entries ADD CONSTRAINT uq_period_entry UNIQUE (church_id, entry_date, category_type, category_id, COALESCE(tag_id, '00000000-0000-0000-0000-000000000000'::uuid));
