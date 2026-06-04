-- ============================================================
-- Church Analytics — Tag Hierarchy Helper
-- Migration: 0020_tag_hierarchy_helper.sql
-- Purpose: Provides a database function to easily insert 
-- into the tag_relationships closure table.
-- ============================================================

CREATE OR REPLACE FUNCTION add_tag_relationship(p_parent_id UUID, p_child_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent cyclic/self referencing
  IF p_parent_id = p_child_id THEN
    RAISE EXCEPTION 'Cannot nest tag under itself';
  END IF;

  -- 1. Insert self-reference for child (if not exists)
  INSERT INTO tag_relationships (ancestor_id, descendant_id, depth)
  VALUES (p_child_id, p_child_id, 0)
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  -- 2. Insert self-reference for parent (if not exists)
  INSERT INTO tag_relationships (ancestor_id, descendant_id, depth)
  VALUES (p_parent_id, p_parent_id, 0)
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  -- 3. Create edges from all ancestors of the parent to all descendants of the child
  INSERT INTO tag_relationships (ancestor_id, descendant_id, depth)
  SELECT 
    a.ancestor_id, 
    d.descendant_id, 
    a.depth + d.depth + 1
  FROM tag_relationships a
  CROSS JOIN tag_relationships d
  WHERE a.descendant_id = p_parent_id 
    AND d.ancestor_id = p_child_id
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;
END;
$$;

-- Ensure authenticated users can execute the function
REVOKE ALL ON FUNCTION add_tag_relationship(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_tag_relationship(UUID, UUID) TO authenticated;
