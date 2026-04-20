-- ============================================================
-- Migration: 0012_ai_usage_rls_write.sql
-- Fix: add INSERT/UPDATE policies to ai_usage_periods and
--      ai_usage_events so server-side budget tracking can write.
-- 0011 only created SELECT policies; writes from authenticated
-- users (owner/admin) were silently blocked by RLS, causing
-- ensurePeriodRow to return null and Stage A to fail.
-- ============================================================

-- ai_usage_periods — allow owner/admin to insert new period rows
CREATE POLICY "ai_usage_periods_owner_admin_insert"
  ON ai_usage_periods
  FOR INSERT
  TO authenticated
  WITH CHECK (is_church_owner_or_admin(church_id));

-- ai_usage_periods — allow owner/admin to update cents_used
CREATE POLICY "ai_usage_periods_owner_admin_update"
  ON ai_usage_periods
  FOR UPDATE
  TO authenticated
  USING  (is_church_owner_or_admin(church_id))
  WITH CHECK (is_church_owner_or_admin(church_id));

-- ai_usage_events — allow owner/admin to append usage events
CREATE POLICY "ai_usage_events_owner_admin_insert"
  ON ai_usage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (is_church_owner_or_admin(church_id));
