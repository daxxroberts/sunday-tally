-- ============================================================
-- Church Analytics — Service Tags
-- Migration: 0008_service_tags.sql
-- Generated: 2026-04-09 (revised — occurrence stamping model)
-- Decisions: D-039 · D-040 final · D-041
-- ============================================================
-- Tags are stamped onto occurrence records at assignment time.
--
-- When a tag is assigned to a service:
--   1. The assignment is recorded in service_template_tags
--   2. apply_tag_to_occurrences() runs immediately — inserts rows
--      into service_occurrence_tags for all matching historical
--      occurrences (filtered by tag date range if set)
--   3. Future occurrences are stamped at creation time
--
-- Reporting queries: JOIN service_occurrence_tags WHERE tag_id = ?
-- No date arithmetic at query time — tags are pre-stamped.
--
-- On tag removal from a service, the UI prompts:
--   "Remove from all records" → deletes service_occurrence_tags rows
--   "Keep past records tagged" → removes template assignment only,
--      historical stamps preserved
--
-- Tag date range (optional, on service_tags):
--   NULL = applies to all occurrences of the service
--   Set  = only occurrences where service_date falls within range
--          are stamped at assignment time
--
-- Renaming a tag: edit tag_name directly — tag_code is stable.
-- Rule 2 revised: dashboard groups by tag, display_name = label.
-- ============================================================


-- ============================================================
-- PART 1 — btree_gist (for any future range queries)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ============================================================
-- PART 2 — service_tags master table
-- ============================================================

CREATE TABLE service_tags (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id            UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  tag_name             TEXT        NOT NULL,
  tag_code             TEXT        NOT NULL,
  is_custom            BOOLEAN     NOT NULL DEFAULT false,
  display_order        INTEGER     NOT NULL DEFAULT 0,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  -- Optional date range — used at assignment time to filter
  -- which historical occurrences get stamped.
  -- NULL = no restriction (all occurrences of the service).
  effective_start_date DATE,
  effective_end_date   DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_service_tag UNIQUE (church_id, tag_code),
  CONSTRAINT chk_tag_date_range CHECK (
    effective_start_date IS NULL OR
    effective_end_date   IS NULL OR
    effective_end_date > effective_start_date
  )
);

CREATE TRIGGER set_service_tags_updated_at
  BEFORE UPDATE ON service_tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_service_tags_church
  ON service_tags (church_id)
  WHERE is_active = true;


-- ============================================================
-- PART 3 — RLS on service_tags
-- ============================================================

ALTER TABLE service_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_tags_select" ON service_tags
  FOR SELECT TO authenticated
  USING (church_id = ANY(get_user_church_ids()));

CREATE POLICY "service_tags_insert" ON service_tags
  FOR INSERT TO authenticated
  WITH CHECK (church_id = ANY(get_user_church_ids()));

CREATE POLICY "service_tags_update" ON service_tags
  FOR UPDATE TO authenticated
  USING (church_id = ANY(get_user_church_ids()));


-- ============================================================
-- PART 4 — service_template_tags (assignment record)
-- ============================================================

CREATE TABLE service_template_tags (
  service_template_id UUID NOT NULL REFERENCES service_templates(id) ON DELETE CASCADE,
  service_tag_id      UUID NOT NULL REFERENCES service_tags(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_template_id, service_tag_id)
);

CREATE INDEX idx_template_tags_template
  ON service_template_tags (service_template_id);

CREATE INDEX idx_template_tags_tag
  ON service_template_tags (service_tag_id);

ALTER TABLE service_template_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_template_tags_select" ON service_template_tags
  FOR SELECT TO authenticated
  USING (
    service_template_id IN (
      SELECT id FROM service_templates
      WHERE church_id = ANY(get_user_church_ids())
    )
  );

CREATE POLICY "service_template_tags_insert" ON service_template_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    service_template_id IN (
      SELECT id FROM service_templates
      WHERE church_id = ANY(get_user_church_ids())
    )
  );

CREATE POLICY "service_template_tags_delete" ON service_template_tags
  FOR DELETE TO authenticated
  USING (
    service_template_id IN (
      SELECT id FROM service_templates
      WHERE church_id = ANY(get_user_church_ids())
    )
  );


-- ============================================================
-- PART 5 — service_occurrence_tags (stamped records)
-- ============================================================

CREATE TABLE service_occurrence_tags (
  service_occurrence_id UUID NOT NULL REFERENCES service_occurrences(id) ON DELETE CASCADE,
  service_tag_id        UUID NOT NULL REFERENCES service_tags(id) ON DELETE RESTRICT,
  stamped_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_occurrence_id, service_tag_id)
);

CREATE INDEX idx_occurrence_tags_occurrence
  ON service_occurrence_tags (service_occurrence_id);

CREATE INDEX idx_occurrence_tags_tag
  ON service_occurrence_tags (service_tag_id);

ALTER TABLE service_occurrence_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_occurrence_tags_select" ON service_occurrence_tags
  FOR SELECT TO authenticated
  USING (
    service_occurrence_id IN (
      SELECT id FROM service_occurrences
      WHERE church_id = ANY(get_user_church_ids())
    )
  );

CREATE POLICY "service_occurrence_tags_insert" ON service_occurrence_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    service_occurrence_id IN (
      SELECT id FROM service_occurrences
      WHERE church_id = ANY(get_user_church_ids())
    )
  );

CREATE POLICY "service_occurrence_tags_delete" ON service_occurrence_tags
  FOR DELETE TO authenticated
  USING (
    service_occurrence_id IN (
      SELECT id FROM service_occurrences
      WHERE church_id = ANY(get_user_church_ids())
    )
  );


-- ============================================================
-- PART 6 — apply_tag_to_occurrences() function
-- Called on tag assignment. Stamps all matching historical
-- occurrences based on tag date range.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_tag_to_occurrences(
  p_tag_id      UUID,
  p_template_id UUID
)
RETURNS INTEGER  -- returns count of occurrences stamped
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag         service_tags%ROWTYPE;
  v_stamped_ct  INTEGER;
BEGIN
  -- Tenant guard — SECURITY DEFINER bypasses RLS, so verify both
  -- the tag and the template belong to one of the caller's churches
  -- before touching service_occurrence_tags.
  IF NOT EXISTS (
    SELECT 1 FROM service_tags
    WHERE id = p_tag_id
      AND church_id IN (SELECT get_user_church_ids())
  ) THEN
    RAISE EXCEPTION 'apply_tag_to_occurrences: tag % is not in caller church', p_tag_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM service_templates
    WHERE id = p_template_id
      AND church_id IN (SELECT get_user_church_ids())
  ) THEN
    RAISE EXCEPTION 'apply_tag_to_occurrences: template % is not in caller church', p_template_id
      USING ERRCODE = '42501';
  END IF;

  -- Load tag to get date range
  SELECT * INTO v_tag FROM service_tags WHERE id = p_tag_id;

  INSERT INTO service_occurrence_tags (service_occurrence_id, service_tag_id)
  SELECT so.id, p_tag_id
  FROM service_occurrences so
  WHERE so.service_template_id = p_template_id
    AND so.status = 'active'
    -- Apply tag date range filter if set
    AND (v_tag.effective_start_date IS NULL OR so.service_date >= v_tag.effective_start_date)
    AND (v_tag.effective_end_date   IS NULL OR so.service_date <= v_tag.effective_end_date)
  ON CONFLICT (service_occurrence_id, service_tag_id) DO NOTHING;

  GET DIAGNOSTICS v_stamped_ct = ROW_COUNT;
  RETURN v_stamped_ct;
END;
$$;

REVOKE ALL ON FUNCTION apply_tag_to_occurrences(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_tag_to_occurrences(UUID, UUID) TO authenticated;


-- ============================================================
-- PART 7 — Seed function
-- ============================================================

CREATE OR REPLACE FUNCTION seed_default_service_tags(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO service_tags
    (church_id, tag_name, tag_code, is_custom, display_order,
     is_active, effective_start_date, effective_end_date)
  VALUES
    (p_church_id, 'Morning', 'MORNING', false, 1, true, NULL, NULL),
    (p_church_id, 'Evening', 'EVENING', false, 2, true, NULL, NULL),
    (p_church_id, 'Midweek', 'MIDWEEK', false, 3, true, NULL, NULL)
  ON CONFLICT (church_id, tag_code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_default_service_tags(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_default_service_tags(UUID) TO authenticated;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Schema now: 19 tables · 8 migrations
-- New tables: service_tags · service_template_tags
--             service_occurrence_tags
-- New functions: apply_tag_to_occurrences() ·
--                seed_default_service_tags()
--
-- Tag assignment flow (application layer):
--   1. INSERT into service_template_tags
--   2. Call apply_tag_to_occurrences(tag_id, template_id)
--   3. Show count of stamped occurrences to user
--
-- Tag removal flow (application layer):
--   UI prompts: "Remove from all records" or "Keep past records"
--   Remove all:  DELETE service_template_tags row
--                DELETE service_occurrence_tags WHERE tag_id = ?
--                  AND occurrence belongs to this template
--   Keep past:   DELETE service_template_tags row only
--                service_occurrence_tags rows preserved
--
-- Future occurrence stamping:
--   On occurrence creation (T1 E3e tap → INSERT service_occurrences),
--   also INSERT into service_occurrence_tags for all tags currently
--   assigned to this template — where occurrence date falls within
--   tag date range (or tag has no date range).
--
-- Dashboard reporting query pattern:
--   JOIN service_occurrence_tags sot
--     ON sot.service_occurrence_id = so.id
--    AND sot.service_tag_id = $tag_id
--   No date arithmetic needed — tags pre-stamped on occurrences.
--
-- Rule 2 revised:
--   OLD: cross-location rollup by display_name
--   NEW: dashboard groups by tag_code
--   display_name = T1 card label and T1b header only
--
-- New settings screen needed: T-tags (tag management)
--   Manage tag library: create, rename, set date range, deactivate
--   Assign tags to services (in T6 service setup)
--
-- Downstream impact:
--   T6: tag assignment required on service creation (≥1 tag)
--   T-tags: new Settings screen
--   P3/P14a/b/c: tag-scoped versions needed
--   D1/D2: tag filter selector above comparison grid
--   APP_CONTEXT.md: Rule 2 update required
--   DECISION_REGISTER.md: D-040/D-041 update required
-- ============================================================
