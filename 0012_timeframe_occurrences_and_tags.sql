-- ============================================================
-- Church Analytics — Timeframe Occurrences & Tag Hierarchy
-- Migration: 0012_timeframe_occurrences_and_tags.sql
-- ============================================================

-- ============================================================
-- 1. Create `occurrences` table (Timeframes)
-- ============================================================
CREATE TABLE occurrences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  location_id     UUID        NOT NULL REFERENCES church_locations(id) ON DELETE RESTRICT,
  timeframe_type  TEXT        NOT NULL CHECK (timeframe_type IN ('daily', 'weekly', 'monthly')),
  occurrence_date DATE        NOT NULL,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_occurrence UNIQUE (church_id, location_id, timeframe_type, occurrence_date)
);

CREATE TRIGGER set_updated_at_occurrences
  BEFORE UPDATE ON occurrences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "occurrences_church_isolation"
  ON occurrences
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

-- ============================================================
-- 2. Rename `service_occurrences` to `service_instances`
-- ============================================================
ALTER TABLE service_occurrences RENAME TO service_instances;
ALTER TABLE service_instances RENAME CONSTRAINT uq_service_occurrence TO uq_service_instance;

-- Link instances to parent occurrences
ALTER TABLE service_instances
  ADD COLUMN occurrence_id UUID REFERENCES occurrences(id) ON DELETE RESTRICT;

-- ============================================================
-- 3. Modify entry tables to support both levels
-- ============================================================

-- Attendance
ALTER TABLE attendance_entries RENAME COLUMN service_occurrence_id TO service_instance_id;
ALTER TABLE attendance_entries ADD COLUMN occurrence_id UUID REFERENCES occurrences(id) ON DELETE RESTRICT;
ALTER TABLE attendance_entries ALTER COLUMN service_instance_id DROP NOT NULL;
ALTER TABLE attendance_entries ADD CONSTRAINT chk_attendance_attachment CHECK (
  (service_instance_id IS NOT NULL AND occurrence_id IS NULL) OR
  (service_instance_id IS NULL AND occurrence_id IS NOT NULL)
);

-- Volunteers
ALTER TABLE volunteer_entries RENAME COLUMN service_occurrence_id TO service_instance_id;
ALTER TABLE volunteer_entries ADD COLUMN occurrence_id UUID REFERENCES occurrences(id) ON DELETE RESTRICT;
ALTER TABLE volunteer_entries ALTER COLUMN service_instance_id DROP NOT NULL;
ALTER TABLE volunteer_entries ADD CONSTRAINT chk_volunteer_attachment CHECK (
  (service_instance_id IS NOT NULL AND occurrence_id IS NULL) OR
  (service_instance_id IS NULL AND occurrence_id IS NOT NULL)
);

-- Giving
ALTER TABLE giving_entries RENAME COLUMN service_occurrence_id TO service_instance_id;
ALTER TABLE giving_entries ADD COLUMN occurrence_id UUID REFERENCES occurrences(id) ON DELETE RESTRICT;
ALTER TABLE giving_entries ALTER COLUMN service_instance_id DROP NOT NULL;
ALTER TABLE giving_entries ADD CONSTRAINT chk_giving_attachment CHECK (
  (service_instance_id IS NOT NULL AND occurrence_id IS NULL) OR
  (service_instance_id IS NULL AND occurrence_id IS NOT NULL)
);

-- Tags
ALTER TABLE service_occurrence_tags RENAME TO instance_tags;
ALTER TABLE instance_tags RENAME COLUMN service_occurrence_id TO service_instance_id;
ALTER TABLE instance_tags ADD COLUMN occurrence_id UUID REFERENCES occurrences(id) ON DELETE CASCADE;
ALTER TABLE instance_tags ALTER COLUMN service_instance_id DROP NOT NULL;
ALTER TABLE instance_tags ADD CONSTRAINT chk_tag_attachment CHECK (
  (service_instance_id IS NOT NULL AND occurrence_id IS NULL) OR
  (service_instance_id IS NULL AND occurrence_id IS NOT NULL)
);

-- ============================================================
-- 4. Tag Hierarchy (Closure Table)
-- ============================================================
CREATE TABLE tag_relationships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ancestor_id   UUID NOT NULL REFERENCES service_tags(id) ON DELETE CASCADE,
  descendant_id UUID NOT NULL REFERENCES service_tags(id) ON DELETE CASCADE,
  depth         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tag_relationship UNIQUE (ancestor_id, descendant_id)
);

ALTER TABLE tag_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_relationships_church_isolation"
  ON tag_relationships
  FOR ALL
  TO authenticated
  USING (
    ancestor_id IN (
      SELECT id FROM service_tags 
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );

-- ============================================================
-- 5. Fix functions reliant on old table names
-- ============================================================
-- Recreate apply_tag_to_occurrences to use new service_instances name
CREATE OR REPLACE FUNCTION apply_tag_to_instances(
  p_tag_id      UUID,
  p_template_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag         service_tags%ROWTYPE;
  v_stamped_ct  INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM service_tags
    WHERE id = p_tag_id
      AND church_id IN (SELECT get_user_church_ids())
  ) THEN
    RAISE EXCEPTION 'apply_tag_to_instances: tag % is not in caller church', p_tag_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM service_templates
    WHERE id = p_template_id
      AND church_id IN (SELECT get_user_church_ids())
  ) THEN
    RAISE EXCEPTION 'apply_tag_to_instances: template % is not in caller church', p_template_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tag FROM service_tags WHERE id = p_tag_id;

  INSERT INTO instance_tags (service_instance_id, service_tag_id)
  SELECT si.id, p_tag_id
  FROM service_instances si
  WHERE si.service_template_id = p_template_id
    AND si.status = 'active'
    AND (v_tag.effective_start_date IS NULL OR si.service_date >= v_tag.effective_start_date)
    AND (v_tag.effective_end_date   IS NULL OR si.service_date <= v_tag.effective_end_date)
  ON CONFLICT (service_instance_id, service_tag_id) DO NOTHING;

  GET DIAGNOSTICS v_stamped_ct = ROW_COUNT;
  RETURN v_stamped_ct;
END;
$$;

DROP FUNCTION IF EXISTS apply_tag_to_occurrences(UUID, UUID);
REVOKE ALL ON FUNCTION apply_tag_to_instances(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_tag_to_instances(UUID, UUID) TO authenticated;
