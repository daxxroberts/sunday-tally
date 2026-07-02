-- ============================================================
-- 0051 — metric_role classification + archive columns
-- STATUS: NEEDS-APPROVAL — FILE ONLY. Do NOT apply until Daxx gives an
--         explicit per-action go. No data is rewritten beyond the additive
--         backfill of the new metric_role column (defaulted + backfilled),
--         so applying this is behavior-NEUTRAL on the read side.
-- Branch: feat/track-mirrored-metrics
-- Plan:   ~/.claude/plans/i-need-to-think-wobbly-lecun.md
--         (Key decisions 1 & 9; the no-double-count invariant)
-- ============================================================
-- WHY
--   The "What we track" restructure needs an EXPLICIT classification of every
--   count — deriving it from `mode` alone can't disambiguate two same-kind
--   roll-ups on one node (the dashboard would silently drop one). So we add a
--   single source-of-truth column, `metric_role`, with four values:
--
--     template       — the legend row on a MINISTRY; mirrors to every group
--                       and shows the sum. Always mode='rollup'.
--     ministry_only  — entered at the ministry, not per group. mode='entry'.
--     group_only     — entered only in one group; not mirrored, not rolled up.
--                       mode='entry'.
--     mirror         — the template as seen inside a group: ghosted/locked,
--                       edited only on the ministry. mode='entry',
--                       parent_metric_id -> its template.
--
--   `mode` stays consistent with the role (template <=> rollup) via a CHECK.
--   `parent_metric_id` (added in 0034) remains the mirror->template roll-up
--   link — we do NOT add a separate `mirrored_from` column, and we do NOT add
--   any new foreign key here (see the _wipe_church_content note at the end).
--
-- WHAT — additive only:
--   1. metrics.metric_role  text  (backfilled, then DEFAULT + NOT NULL)
--   2. metrics.archived_at      timestamptz NULL
--   3. service_tags.archived_at timestamptz NULL
--   plus two CHECK constraints on metric_role.
--
-- ARCHIVE SEMANTICS (agreed — plan decision 9):
--   "archived" == archived_at IS NOT NULL, and is a state DISTINCT from
--   is_active=false. An archived row KEEPS is_active=true on purpose, so the
--   roll-up views (0045: attendance_per_occurrence, volunteers_per_occurrence,
--   metric_entries_readable), computeRollups, and History — all of which
--   already include is_active=true rows — keep counting an archived node's
--   HISTORICAL entries exactly as before (no view change, no double-count).
--   Only the setup editor and the entry screen add `archived_at IS NULL` to
--   their reads (in a later code phase) so an archived node stops accepting new
--   data and disappears from those two surfaces. This migration only ADDS the
--   columns and documents the contract; no read path is changed here.
--
-- LIVE-DB VERIFIED (read-only, just now) before writing this file:
--   • metrics has NO metric_role / archived_at yet; service_tags has NO
--     archived_at yet (idempotent ADD IF NOT EXISTS is still used).
--   • Backfill preview over the 35 live rows: 4 template, 1 mirror,
--     0 group_only, 30 ministry_only, 0 left NULL — the four buckets are
--     mutually exclusive and exhaustive under the ordering below.
--   • is_church_manager(uuid) exists (used by 0052, not here).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS; DROP CONSTRAINT IF EXISTS before ADD).
-- ============================================================


-- ------------------------------------------------------------
-- 1. metric_role — add nullable first so we can backfill deterministically.
-- ------------------------------------------------------------
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS metric_role text;


-- ------------------------------------------------------------
-- 2. Backfill — ORDER MATTERS. Each step only fills rows still NULL, so the
--    buckets are mutually exclusive regardless of statement order at runtime.
-- ------------------------------------------------------------

-- (a) Every roll-up is a template legend.
UPDATE metrics
   SET metric_role = 'template'
 WHERE metric_role IS NULL
   AND mode = 'rollup';

-- (b) An entry that points up at a roll-up is a mirror of that template.
UPDATE metrics
   SET metric_role = 'mirror'
 WHERE metric_role IS NULL
   AND mode = 'entry'
   AND parent_metric_id IS NOT NULL;

-- (c) An unlinked entry whose ministry tag is itself a child tag (a group)
--     is a group-only count.
UPDATE metrics
   SET metric_role = 'group_only'
 WHERE metric_role IS NULL
   AND mode = 'entry'
   AND parent_metric_id IS NULL
   AND ministry_tag_id IN (
     SELECT id FROM service_tags WHERE parent_tag_id IS NOT NULL
   );

-- (d) Everything remaining is a plain ministry-level count.
UPDATE metrics
   SET metric_role = 'ministry_only'
 WHERE metric_role IS NULL;


-- ------------------------------------------------------------
-- 3. Lock it in: default for future inserts, then NOT NULL.
-- ------------------------------------------------------------
ALTER TABLE metrics ALTER COLUMN metric_role SET DEFAULT 'ministry_only';
ALTER TABLE metrics ALTER COLUMN metric_role SET NOT NULL;


-- ------------------------------------------------------------
-- 4. CHECK — metric_role is one of the four known values.
-- ------------------------------------------------------------
ALTER TABLE metrics DROP CONSTRAINT IF EXISTS chk_metric_role_valid;
ALTER TABLE metrics ADD CONSTRAINT chk_metric_role_valid
  CHECK (metric_role IN ('template', 'ministry_only', 'group_only', 'mirror'));


-- ------------------------------------------------------------
-- 5. CHECK — template IFF rollup. Keeps `mode` and `metric_role` consistent
--    without over-constraining the mirror/parent-pointer states (the server
--    validates same-Kind + ancestor-parent rules; a DB CHECK there would
--    reject legit intermediate states during edits).
-- ------------------------------------------------------------
ALTER TABLE metrics DROP CONSTRAINT IF EXISTS chk_metric_role_mode;
ALTER TABLE metrics ADD CONSTRAINT chk_metric_role_mode
  CHECK ((metric_role = 'template') = (mode = 'rollup'));


-- ------------------------------------------------------------
-- 6. archived_at on BOTH tables (nullable; NULL = not archived).
--    See ARCHIVE SEMANTICS in the header: archived rows stay is_active=true so
--    roll-ups / views / History are unchanged; only editor + entry reads will
--    add `archived_at IS NULL` later. No index — archived_at is only read
--    inside per-church editor queries that are already church-scoped and small.
-- ------------------------------------------------------------
ALTER TABLE metrics      ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE service_tags ADD COLUMN IF NOT EXISTS archived_at timestamptz;


-- ============================================================
-- _wipe_church_content (0047) — NO CHANGE NEEDED.
-- Verified against 0047: this migration introduces NO new foreign key. The
-- only child->parent link (metrics.parent_metric_id, from 0034) already exists
-- and is ON DELETE SET NULL; both new archived_at columns are plain nullable
-- timestamps with no FK. 0047 deletes metrics BEFORE service_tags and both are
-- deleted wholesale per church_id, so its delete order and success are
-- unaffected by anything added here.
-- ============================================================
-- END 0051 — review, then apply_migration. After apply, regenerate Supabase
-- types so `metrics` exposes metric_role + archived_at and `service_tags`
-- exposes archived_at.
-- ============================================================
