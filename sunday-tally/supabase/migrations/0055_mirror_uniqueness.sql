-- ============================================================
-- 0055 — unique index to close the concurrent double-mirror race
-- STATUS: NEEDS-APPROVAL — FILE ONLY. Do NOT apply until Daxx gives an
--         explicit per-action go. Surfaced by code review finding #25.
-- Branch: feat/track-mirrored-metrics
-- ============================================================
-- WHY
--   insertMirror() (src/app/(app)/settings/track/actions.ts) is a
--   check-then-insert: it SELECTs "does this group already have a live mirror
--   of this template?" and only inserts if not. Two concurrent calls for the
--   same (template, group) — e.g. mirrorTemplateToClasses racing a manual
--   addCount, or two admin tabs open at once — can both pass the check and
--   both insert, giving one subgroup two active mirrors of the same template
--   (double-counted in every roll-up that sums that group's mirrors).
--
--   A partial unique index on (parent_metric_id, ministry_tag_id) scoped to
--   live mirror rows makes the second insert fail atomically instead of
--   silently duplicating. Scoped (not a bare UNIQUE) because non-mirror rows
--   have parent_metric_id/metric_role that don't apply, and an archived or
--   deleted-then-recreated mirror must not block a fresh one.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS. No data is touched.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_mirror_per_group
  ON metrics (parent_metric_id, ministry_tag_id)
  WHERE metric_role = 'mirror' AND is_active = true AND archived_at IS NULL;

-- ============================================================
-- END 0055 — review, then apply_migration. No type regen needed (index only).
-- After applying, insertMirror()'s insert should treat a unique-violation
-- (Postgres code 23505) on this index as "already mirrored" (return the
-- existing mirror's id via a follow-up SELECT) rather than a hard failure —
-- see the accompanying code comment in actions.ts.
-- ============================================================
