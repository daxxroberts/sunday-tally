-- ============================================================
-- Church Analytics — Full Reset (teardown for unified tag model)
-- Migration: 0022_full_reset.sql
-- Purpose: Wipe all test data and drop every table/function the
--          category-per-kind model removes, ahead of the unified
--          tag-first redesign. No CREATEs in this file — pure teardown.
-- Decisions: D-059..D-070
-- ============================================================
-- ALL current data is disposable test data. This is a FULL RESET:
-- TRUNCATE churches CASCADE clears every church-scoped child table
-- (including the tables we keep: billing_events, ai_usage_periods,
-- ai_usage_events, import_jobs, notifications_sent — all reachable by
-- FK cascade from churches). The church is re-provisioned at signup.
-- ============================================================


-- ============================================================
-- PART 1 — Full data reset
-- ============================================================
-- Cascades to every table with an FK to churches (directly or
-- transitively), which is every church-scoped data table in the schema.
TRUNCATE TABLE churches CASCADE;


-- ============================================================
-- PART 2 — Drop tables removed by the unified model
-- ============================================================
-- Order does not matter — CASCADE handles dependent objects.
DROP TABLE IF EXISTS attendance_entries     CASCADE;
DROP TABLE IF EXISTS volunteer_entries      CASCADE;
DROP TABLE IF EXISTS response_entries       CASCADE;
DROP TABLE IF EXISTS giving_entries         CASCADE;
DROP TABLE IF EXISTS church_period_giving   CASCADE;
DROP TABLE IF EXISTS church_period_entries  CASCADE;
DROP TABLE IF EXISTS volunteer_categories   CASCADE;
DROP TABLE IF EXISTS response_categories    CASCADE;
DROP TABLE IF EXISTS giving_sources         CASCADE;
DROP TABLE IF EXISTS occurrences            CASCADE;
DROP TABLE IF EXISTS instance_tags          CASCADE;
DROP TABLE IF EXISTS tag_relationships      CASCADE;
DROP TABLE IF EXISTS service_template_tags  CASCADE;


-- ============================================================
-- PART 3 — Drop functions tied to the removed model
-- ============================================================
DROP FUNCTION IF EXISTS apply_tag_to_instances(UUID, UUID);
DROP FUNCTION IF EXISTS add_tag_relationship(UUID, UUID);


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Data:      all churches + all church-scoped data truncated
-- Tables dropped: 13
--   attendance_entries, volunteer_entries, response_entries,
--   giving_entries, church_period_giving, church_period_entries,
--   volunteer_categories, response_categories, giving_sources,
--   occurrences, instance_tags, tag_relationships,
--   service_template_tags
-- Functions dropped: 2 (apply_tag_to_instances, add_tag_relationship)
-- Kept (structure intact, data cleared by TRUNCATE):
--   churches, church_locations, church_memberships, church_invites,
--   user_profiles, service_templates, service_instances, service_tags,
--   service_schedule_versions, ai_usage_periods, ai_usage_events,
--   import_jobs, billing_events, notifications_sent
-- ============================================================
