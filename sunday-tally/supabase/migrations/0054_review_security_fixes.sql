-- ============================================================
-- 0054 — code-review security + integrity fixes
-- STATUS: NEEDS-APPROVAL — FILE ONLY. Do NOT apply until Daxx gives an explicit
--         per-action go. Fixes surfaced by the full-branch code review.
-- Branch: feat/track-mirrored-metrics
-- ============================================================
-- WHAT & WHY
--
-- 1. church_email_stats(uuid) — CLOSE cross-tenant leak (review finding #15).
--    0048 granted EXECUTE to `authenticated`, so ANY signed-in user could
--    `rpc('church_email_stats', { p_church_id: <any church uuid> })` and read
--    that church's services / weeks / attendance / volunteers / GIVING ($). The
--    only legitimate callers are the crons + signup welcome, all on the
--    service-role client (see getChurchEmailData usages). So we REVOKE the
--    authenticated grant and grant EXECUTE to service_role only. An in-function
--    membership check is NOT used on purpose: the service role is not a church
--    member, so a membership guard would break the crons.
--
--    Same function also fixes Rule 1 (review finding #17): weeksTracked counted
--    service_instances of EVERY status; cancelled occurrences inflated it. Add
--    `status = 'active'` to match servicesLogged directly above it.
--
-- 2. enforce_service_tag_depth() — CLOSE the depth-3 hole (review finding #4).
--    The 0052 trigger only checked whether NEW.parent_tag_id itself has a parent.
--    Reparenting a node that ALREADY HAS CHILDREN (A->G, then A.parent := B)
--    yields B->A->G (depth 3) and passed the "bypass-proof" trigger. The whole
--    mirrored-metrics model assumes depth <= 2. We add a has-children check on
--    NEW.id, and take a FOR UPDATE row lock on the parent so two concurrent
--    writes referencing the same parent can't both slip past (an INSERT-under-P
--    blocks on an in-flight UPDATE-of-P and then re-reads P's new depth).
--
-- Idempotent: CREATE OR REPLACE only. No data is touched.
-- ============================================================


-- ------------------------------------------------------------
-- 1. church_email_stats — revoke authenticated, Rule-1 fix on weeksTracked.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION church_email_stats(p_church_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object(
    'servicesLogged', (SELECT count(*) FROM service_instances WHERE church_id = p_church_id AND status = 'active'),
    'weeksTracked',   (SELECT count(DISTINCT date_trunc('week', service_date)) FROM service_instances WHERE church_id = p_church_id AND status = 'active'),
    'attendance',     COALESCE((SELECT sum(value) FROM metric_entries WHERE church_id = p_church_id AND reporting_tag_code = 'ATTENDANCE'), 0),
    'giving',         COALESCE((SELECT sum(value) FROM metric_entries WHERE church_id = p_church_id AND reporting_tag_code = 'GIVING'), 0),
    'volunteers',     COALESCE((SELECT sum(value) FROM metric_entries WHERE church_id = p_church_id AND reporting_tag_code = 'VOLUNTEERS'), 0)
  );
$$;

-- Only the service role (crons + signup welcome) may read another church's
-- aggregates. End users must NOT be able to call this directly.
REVOKE ALL     ON FUNCTION church_email_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION church_email_stats(UUID) TO service_role;


-- ------------------------------------------------------------
-- 2. enforce_service_tag_depth — reject reparenting a node that has children,
--    and serialize concurrent writes under the same parent.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_service_tag_depth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_has_parent boolean;
BEGIN
  IF NEW.parent_tag_id IS NOT NULL THEN
    -- Lock the parent row so a concurrent reparent of the parent can't let a
    -- child slip in at what becomes depth 3 (the INSERT/UPDATE below blocks on
    -- any in-flight write to the parent, then re-reads its committed depth).
    SELECT (p.parent_tag_id IS NOT NULL)
      INTO v_parent_has_parent
      FROM service_tags p
     WHERE p.id = NEW.parent_tag_id
     FOR UPDATE;

    IF COALESCE(v_parent_has_parent, false) THEN
      RAISE EXCEPTION
        'Groups can only be nested one level deep — a group cannot contain other groups.'
        USING ERRCODE = 'P0001';
    END IF;

    -- A node that itself has children cannot become someone's child (that would
    -- make its children depth 3). Covers UPDATE reparenting; INSERTs have no
    -- children yet so this is a no-op for them.
    IF EXISTS (SELECT 1 FROM service_tags c WHERE c.parent_tag_id = NEW.id) THEN
      RAISE EXCEPTION
        'This group contains subgroups, so it can''t be moved under another group.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition unchanged (0052 already created it BEFORE INSERT OR UPDATE);
-- CREATE OR REPLACE FUNCTION above swaps the body in place.

-- ------------------------------------------------------------
-- 3. notifications_sent — UNIQUE(church_id, kind) so email dedup is ATOMIC.
--    0011 created only a plain index. The crons dedup check-then-insert, which
--    races (two overlapping runs both pass the check and both send — review
--    finding #38). A unique constraint lets sendOnce claim-first (insert, then
--    send) so a duplicate claim is rejected by the DB, not by a stale read.
--    Dedup any exact duplicates first so the unique index can be built.
-- ------------------------------------------------------------
DELETE FROM notifications_sent a
 USING notifications_sent b
 WHERE a.church_id = b.church_id
   AND a.kind = b.kind
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_church_kind
  ON notifications_sent (church_id, kind);

-- ============================================================
-- END 0054 — review, then apply_migration. No type regen needed.
-- ============================================================
