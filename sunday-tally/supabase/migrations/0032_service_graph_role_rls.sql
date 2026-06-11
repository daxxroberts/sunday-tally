-- ============================================================
-- 0032 — SUPERSEDED (no-op). Never applied.
-- ============================================================
-- The role-aware service-graph RLS this file introduced (SELECT for all members
-- + owner/admin writes on config + editor writes on instances/entries) was never
-- applied to production. It has been FOLDED INTO 0042_member_campus_scope.sql,
-- which recreates the same policies WITH the per-campus location gate. Applying
-- the original 0032 after 0042 would drop/duplicate those policies, so this file
-- is intentionally reduced to a no-op to keep `db push` order-safe.
--
-- See 0042 for the live definitions.
-- ============================================================

SELECT 1;  -- no-op
