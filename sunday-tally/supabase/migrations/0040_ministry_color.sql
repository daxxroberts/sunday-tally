-- ============================================================
-- Migration 0040 — ministry color
-- STATUS: APPLIED — verified in supabase_migrations.schema_migrations on 2026-06-15. (Header previously marked NEEDS-APPROVAL in error; do not re-apply.)
-- Dependencies: none.
-- ============================================================
-- WHY (Builder 2026-06-10): "I would love to specify a color … every time we
-- see that color, we'll know that's part of that ministry." A ministry node
-- (service_tags) carries an optional hex color chosen by the church. NULL =
-- no choice → the deterministic palette assigns one (existing behavior).
-- Consumers: track tree accents, History group headers; more surfaces follow.
-- ============================================================

ALTER TABLE service_tags
  ADD COLUMN IF NOT EXISTS color TEXT
  CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');

-- ============================================================
-- MIGRATION COMPLETE — additive, no data changed; reversible by
-- ALTER TABLE service_tags DROP COLUMN color.
-- ============================================================
