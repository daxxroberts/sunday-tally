-- ============================================================
-- 0030 — ai_usage_events.job_id  (NEEDS-APPROVAL — NOT APPLIED)
-- ============================================================
-- WHY
-- Per-import AI cost is currently un-attributable: ai_usage_events records
-- church_id + request_kind + cents, but nothing ties an event to the import
-- job that caused it. To tune the trial budget caps ($1.00 setup / $0.50
-- analytics) against real data we need cost-per-import, which today can only
-- be eyeballed from created_at clustering.
--
-- WHAT
-- Add a nullable job_id to ai_usage_events. The app now threads the import
-- job id from every import-path call site (runStageA / runStageARound2 /
-- runPatternReader / interpretViolations / walkthrough chat) through
-- recordUsage(). analytics_chat events have no job and leave it NULL.
--
-- SAFETY
-- Additive + nullable — no backfill required, no behavior change, fully
-- backward-compatible (existing rows keep job_id = NULL). No FK constraint:
-- analytics events legitimately have no job, and we don't want a delete of an
-- import_jobs row to cascade-block usage history. Apply, then per-import cost
-- is: SELECT job_id, sum(cents) FROM ai_usage_events GROUP BY job_id.
-- ============================================================

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS job_id uuid;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_job
  ON ai_usage_events (church_id, job_id);

-- ============================================================
-- END 0030 — review, then apply_migration.
-- ============================================================
