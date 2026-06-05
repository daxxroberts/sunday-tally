-- ============================================================
-- Sunday Tally - Merge Giving Sources
-- Migration: 0017_merge_giving_sources.sql
-- Purpose: Recover accidental duplicate/replacement giving sources
--          without losing historical service or period giving.
-- ============================================================

CREATE OR REPLACE FUNCTION merge_giving_sources(
  p_church_id UUID,
  p_from_source_id UUID,
  p_to_source_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_from_source giving_sources%ROWTYPE;
  v_to_source giving_sources%ROWTYPE;
  v_service_conflicts INTEGER := 0;
  v_service_moved INTEGER := 0;
  v_period_conflicts INTEGER := 0;
  v_period_moved INTEGER := 0;
BEGIN
  IF p_from_source_id = p_to_source_id THEN
    RAISE EXCEPTION 'source ids must be different';
  END IF;

  SELECT role INTO v_role
  FROM church_memberships
  WHERE church_id = p_church_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'editor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_from_source
  FROM giving_sources
  WHERE id = p_from_source_id
    AND church_id = p_church_id
  FOR UPDATE;

  SELECT * INTO v_to_source
  FROM giving_sources
  WHERE id = p_to_source_id
    AND church_id = p_church_id
  FOR UPDATE;

  IF v_from_source.id IS NULL OR v_to_source.id IS NULL THEN
    RAISE EXCEPTION 'source not found';
  END IF;

  -- Service-level conflicts: add old amounts into the kept source, then remove old rows.
  WITH conflicts AS (
    SELECT old.id AS old_id, kept.id AS kept_id, old.giving_amount AS old_amount
    FROM giving_entries old
    JOIN giving_entries kept
      ON kept.service_occurrence_id = old.service_occurrence_id
     AND kept.giving_source_id = p_to_source_id
    WHERE old.giving_source_id = p_from_source_id
  ), updated AS (
    UPDATE giving_entries ge
    SET giving_amount = ge.giving_amount + conflicts.old_amount
    FROM conflicts
    WHERE ge.id = conflicts.kept_id
    RETURNING conflicts.old_id
  ), deleted AS (
    DELETE FROM giving_entries ge
    USING updated
    WHERE ge.id = updated.old_id
    RETURNING ge.id
  )
  SELECT count(*) INTO v_service_conflicts FROM deleted;

  UPDATE giving_entries
  SET giving_source_id = p_to_source_id
  WHERE giving_source_id = p_from_source_id;
  GET DIAGNOSTICS v_service_moved = ROW_COUNT;

  -- Period-level conflicts: same behavior for weekly/monthly church-wide giving.
  WITH conflicts AS (
    SELECT old.id AS old_id, kept.id AS kept_id, old.giving_amount AS old_amount
    FROM church_period_giving old
    JOIN church_period_giving kept
      ON kept.church_id = old.church_id
     AND kept.entry_period_type = old.entry_period_type
     AND kept.period_date = old.period_date
     AND kept.giving_source_id = p_to_source_id
    WHERE old.church_id = p_church_id
      AND old.giving_source_id = p_from_source_id
  ), updated AS (
    UPDATE church_period_giving cpg
    SET giving_amount = cpg.giving_amount + conflicts.old_amount
    FROM conflicts
    WHERE cpg.id = conflicts.kept_id
    RETURNING conflicts.old_id
  ), deleted AS (
    DELETE FROM church_period_giving cpg
    USING updated
    WHERE cpg.id = updated.old_id
    RETURNING cpg.id
  )
  SELECT count(*) INTO v_period_conflicts FROM deleted;

  UPDATE church_period_giving
  SET giving_source_id = p_to_source_id
  WHERE church_id = p_church_id
    AND giving_source_id = p_from_source_id;
  GET DIAGNOSTICS v_period_moved = ROW_COUNT;

  UPDATE giving_sources
  SET is_active = true
  WHERE id = p_to_source_id;

  UPDATE giving_sources
  SET is_active = false
  WHERE id = p_from_source_id;

  RETURN jsonb_build_object(
    'service_conflicts_summed', v_service_conflicts,
    'service_rows_moved', v_service_moved,
    'period_conflicts_summed', v_period_conflicts,
    'period_rows_moved', v_period_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION merge_giving_sources(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_giving_sources(UUID, UUID, UUID) TO authenticated;
