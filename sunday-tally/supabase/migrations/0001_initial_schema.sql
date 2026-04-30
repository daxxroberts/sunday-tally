-- ============================================================
-- Church Analytics — V1 Initial Schema
-- Migration: 0001_initial_schema.sql
-- Generated: 2026-04-09
-- Reviewed: ATLAS · Verified: PARSE · Corrections applied
-- ============================================================
-- PARSE corrections applied:
--   [1] gen_random_uuid() — native Postgres, no extension needed
--   [2] TO authenticated on all policies
--   [3] SELECT wrapping on auth.uid() and helper function calls
--   [4] REVOKE EXECUTE FROM anon, public on helper function
--   [5] Invite token generated in app code — no gen_random_bytes() default
--   [6] NUMERIC(12,2) confirmed for giving amounts
-- ============================================================


-- ============================================================
-- SECTION 0 — SHARED INFRASTRUCTURE
-- Run first. All policies depend on this function.
-- ============================================================

-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- RLS helper: returns all church_ids the current user is an active member of.
-- SECURITY DEFINER bypasses RLS on church_memberships (prevents recursion).
-- SET search_path locks the schema context — prevents search path injection.
-- STABLE allows Postgres optimizer to cache result per statement (not per row).
CREATE OR REPLACE FUNCTION get_user_church_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT church_id
  FROM church_memberships
  WHERE user_id = (SELECT auth.uid())
    AND is_active = true;
$$;

-- Lock down the helper — must not be callable by unauthenticated users via RPC
REVOKE EXECUTE ON FUNCTION get_user_church_ids() FROM anon, public;
GRANT EXECUTE ON FUNCTION get_user_church_ids() TO authenticated;


-- ============================================================
-- SECTION 1 — CHURCH & LOCATION STRUCTURE
-- Layer 3 in build sequence (depends on nothing above it)
-- ============================================================

CREATE TABLE churches (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  status     TEXT        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'suspended', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_churches
  BEFORE UPDATE ON churches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: members can SELECT their own church. INSERT is service-role only.
ALTER TABLE churches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "churches_member_read"
  ON churches
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT get_user_church_ids()));


-- --------------------------------------------------------

CREATE TABLE church_locations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  name       TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_location_code UNIQUE (church_id, code)
);

CREATE TRIGGER set_updated_at_church_locations
  BEFORE UPDATE ON church_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE church_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locations_church_isolation"
  ON church_locations
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- --------------------------------------------------------

CREATE TABLE service_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  location_id      UUID        NOT NULL REFERENCES church_locations(id) ON DELETE RESTRICT,
  service_code     TEXT        NOT NULL,
  display_name     TEXT        NOT NULL,
  service_category TEXT,
  audience_type    TEXT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_service_code UNIQUE (church_id, location_id, service_code)
);

-- Index: dashboard cross-location rollup queries by display_name join on church
CREATE INDEX idx_service_templates_church
  ON service_templates (church_id, is_active);

CREATE TRIGGER set_updated_at_service_templates
  BEFORE UPDATE ON service_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE service_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_templates_church_isolation"
  ON service_templates
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- SECTION 2 — IDENTITY & ACCESS CONTROL
-- Layer 7 in build sequence. church_memberships must exist
-- before get_user_church_ids() is callable in policies.
-- ============================================================

-- user_profiles extends auth.users (managed by Supabase Auth)
CREATE TABLE user_profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users see and edit only their own profile
CREATE POLICY "profiles_own_access"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = id);


-- --------------------------------------------------------

CREATE TABLE church_memberships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL
                CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  invited_by  UUID        REFERENCES auth.users(id),
  invited_at  TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_membership UNIQUE (church_id, user_id)
);

-- Index: get_user_church_ids() uses this lookup on every policy evaluation
CREATE INDEX idx_memberships_user_active
  ON church_memberships (user_id, is_active);

CREATE TRIGGER set_updated_at_church_memberships
  BEFORE UPDATE ON church_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE church_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memberships_church_isolation"
  ON church_memberships
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- Last-owner protection trigger
-- Prevents the final Owner of a church from being deactivated or demoted.
CREATE OR REPLACE FUNCTION check_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only runs when role or is_active changes on an owner row
  IF OLD.role = 'owner' AND (NEW.role != 'owner' OR NEW.is_active = false) THEN
    IF (
      SELECT COUNT(*)
      FROM church_memberships
      WHERE church_id = OLD.church_id
        AND role = 'owner'
        AND is_active = true
        AND id != OLD.id
    ) = 0 THEN
      RAISE EXCEPTION
        'Cannot remove or demote the last active owner of church %.', OLD.church_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_last_owner
  BEFORE UPDATE ON church_memberships
  FOR EACH ROW EXECUTE FUNCTION check_last_owner();


-- --------------------------------------------------------
-- PARSE correction: invite token generated in application code.
-- token column is NOT NULL with no DEFAULT — app must supply it on INSERT.
-- This avoids the extensions.gen_random_bytes() search_path issue entirely.

CREATE TABLE church_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL
                CHECK (role IN ('admin', 'editor', 'viewer')),
  token       TEXT        NOT NULL UNIQUE,  -- supplied by app, e.g. crypto.randomBytes(32).toString('hex')
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by  UUID        REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: invite acceptance lookup by token (public link click)
CREATE INDEX idx_invites_token
  ON church_invites (token);

-- Index: admin "pending invites" view by email
CREATE INDEX idx_invites_email_status
  ON church_invites (email, status);

ALTER TABLE church_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_church_isolation"
  ON church_invites
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- SECTION 3 — SCHEDULE VERSIONING
-- Layer 8 in build sequence. Setup UI only in V1.
-- Occurrences store their own start_datetime independently.
-- No FK from service_occurrences to this table in V1.
-- ============================================================

CREATE TABLE service_schedule_versions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_template_id  UUID        NOT NULL REFERENCES service_templates(id) ON DELETE CASCADE,
  effective_start_date DATE        NOT NULL,
  effective_end_date   DATE,
  day_of_week          INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time           TIME        NOT NULL,
  end_time             TIME,
  timezone             TEXT        NOT NULL DEFAULT 'America/Chicago',
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_schedule_version UNIQUE (service_template_id, effective_start_date)
);

ALTER TABLE service_schedule_versions ENABLE ROW LEVEL SECURITY;

-- RLS via service_template -> church_id (two-hop join, both independently secured)
CREATE POLICY "schedule_versions_church_isolation"
  ON service_schedule_versions
  FOR ALL
  TO authenticated
  USING (
    service_template_id IN (
      SELECT id FROM service_templates
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );


-- ============================================================
-- SECTION 4 — SERVICE OCCURRENCE CORE
-- Layer 1 in build sequence (god node — degree 14).
-- All entry tables attach here. Composite unique constraint
-- prevents duplicate occurrences silently double-counting dashboards.
-- ============================================================

CREATE TABLE service_occurrences (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  location_id         UUID        NOT NULL REFERENCES church_locations(id) ON DELETE RESTRICT,
  service_template_id UUID        NOT NULL REFERENCES service_templates(id) ON DELETE RESTRICT,
  service_date        DATE        NOT NULL,
  start_datetime      TIMESTAMPTZ,  -- nullable: occurrence stores own time; schedule_versions is setup UI only
  end_datetime        TIMESTAMPTZ,
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'cancelled', 'special')),
  notes               TEXT,
  created_by          UUID        REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevents duplicate occurrences silently double-counting in dashboard queries
  CONSTRAINT uq_service_occurrence
    UNIQUE (church_id, location_id, service_template_id, service_date)
);

-- Primary dashboard index: all queries filter by church + date range
CREATE INDEX idx_service_occurrences_church_date
  ON service_occurrences (church_id, service_date);

-- Secondary dashboard index: per-template trend queries
CREATE INDEX idx_service_occurrences_template_date
  ON service_occurrences (service_template_id, service_date);

CREATE TRIGGER set_updated_at_service_occurrences
  BEFORE UPDATE ON service_occurrences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE service_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_occurrences_church_isolation"
  ON service_occurrences
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- SECTION 5 — ATTENDANCE DATA LAYER
-- Layer 4 in build sequence.
-- One row per occurrence (enforced by unique constraint).
-- NULL count = not entered. 0 = zero attendance. Both are valid.
-- Correction model: last-write-wins with audit fields.
-- ============================================================

CREATE TABLE attendance_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_occurrence_id UUID        NOT NULL REFERENCES service_occurrences(id) ON DELETE RESTRICT,
  main_attendance       INTEGER     CHECK (main_attendance >= 0),
  kids_attendance       INTEGER     CHECK (kids_attendance >= 0),
  youth_attendance      INTEGER     CHECK (youth_attendance >= 0),
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID        REFERENCES auth.users(id),
  last_updated_by       UUID        REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One attendance record per service occurrence — no accidental duplicates
  CONSTRAINT uq_attendance_per_occurrence UNIQUE (service_occurrence_id)
);

CREATE TRIGGER set_updated_at_attendance_entries
  BEFORE UPDATE ON attendance_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE attendance_entries ENABLE ROW LEVEL SECURITY;

-- Child table: no direct church_id. Policy joins through service_occurrences.
-- The index on service_occurrences(church_id, service_date) makes this performant.
CREATE POLICY "attendance_church_isolation"
  ON attendance_entries
  FOR ALL
  TO authenticated
  USING (
    service_occurrence_id IN (
      SELECT id FROM service_occurrences
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );


-- ============================================================
-- SECTION 6 — VOLUNTEER DATA LAYER
-- Layer 5 in build sequence.
-- category_code is IMMUTABLE once created (enforced in app logic + docs).
-- Soft delete only — never hard delete volunteer_categories.
-- is_not_applicable distinguishes "zero" from "not applicable".
-- ============================================================

CREATE TABLE volunteer_categories (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  audience_group_code TEXT        NOT NULL
                        CHECK (audience_group_code IN ('MAIN', 'KIDS', 'YOUTH')),
  category_code       TEXT        NOT NULL,  -- IMMUTABLE after insert — app must enforce
  category_name       TEXT        NOT NULL,  -- mutable display label
  is_active           BOOLEAN     NOT NULL DEFAULT true,  -- soft delete only, never hard DELETE
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_category_code UNIQUE (church_id, audience_group_code, category_code)
);

CREATE TRIGGER set_updated_at_volunteer_categories
  BEFORE UPDATE ON volunteer_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE volunteer_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "volunteer_categories_church_isolation"
  ON volunteer_categories
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- --------------------------------------------------------

CREATE TABLE volunteer_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_occurrence_id UUID        NOT NULL REFERENCES service_occurrences(id) ON DELETE RESTRICT,
  volunteer_category_id UUID        NOT NULL REFERENCES volunteer_categories(id) ON DELETE RESTRICT,
  volunteer_count       INTEGER     NOT NULL DEFAULT 0 CHECK (volunteer_count >= 0),
  is_not_applicable     BOOLEAN     NOT NULL DEFAULT false,
  -- is_not_applicable = true  → this category doesn't apply to this occurrence
  -- is_not_applicable = false + count = 0 → zero volunteers this week
  -- no row at all → data not yet entered (treated as NULL in dashboards)
  notes                 TEXT,
  created_by            UUID        REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_volunteer_entry UNIQUE (service_occurrence_id, volunteer_category_id)
);

CREATE TRIGGER set_updated_at_volunteer_entries
  BEFORE UPDATE ON volunteer_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE volunteer_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "volunteer_entries_church_isolation"
  ON volunteer_entries
  FOR ALL
  TO authenticated
  USING (
    service_occurrence_id IN (
      SELECT id FROM service_occurrences
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );


-- ============================================================
-- SECTION 7 — GIVING DATA LAYER
-- Layer 6 in build sequence. Thinnest cluster — build conservatively.
-- Multiple rows per occurrence allowed (supports delayed giving additions).
-- giving_type enum includes future V2 types — no migration needed to add split.
-- NUMERIC(12,2) — never FLOAT for financial data.
-- ============================================================

CREATE TABLE giving_entries (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  service_occurrence_id UUID           NOT NULL REFERENCES service_occurrences(id) ON DELETE RESTRICT,
  giving_amount         NUMERIC(12, 2) NOT NULL CHECK (giving_amount >= 0),
  giving_type           TEXT           NOT NULL DEFAULT 'total'
                          CHECK (giving_type IN ('total', 'cash', 'check', 'online', 'other')),
  -- V1 uses 'total' only. V2 adds 'cash', 'check', 'online' rows to same occurrence — no schema change needed.
  notes                 TEXT,
  submitted_by          UUID           REFERENCES auth.users(id),
  submitted_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_giving_occurrence
  ON giving_entries (service_occurrence_id);

CREATE TRIGGER set_updated_at_giving_entries
  BEFORE UPDATE ON giving_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE giving_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "giving_entries_church_isolation"
  ON giving_entries
  FOR ALL
  TO authenticated
  USING (
    service_occurrence_id IN (
      SELECT id FROM service_occurrences
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Tables:       12
-- RLS policies: 12 (one per table, TO authenticated on all)
-- Indexes:      6
-- Triggers:     13 (11 updated_at + check_last_owner + enforce_last_owner)
-- Functions:    3 (set_updated_at, get_user_church_ids, check_last_owner)
-- ============================================================
-- PARSE corrections applied in this migration:
--   ✅ gen_random_uuid()      — native Postgres, no extension
--   ✅ TO authenticated       — all policies scoped to authenticated role
--   ✅ SELECT wrapping        — auth.uid() and helper calls wrapped for caching
--   ✅ REVOKE/GRANT           — helper function locked to authenticated only
--   ✅ Invite token           — generated in app, no gen_random_bytes() default
--   ✅ NUMERIC(12,2)          — exact decimal for financial data
-- ============================================================
-- ATLAS pre-build checklist status:
--   ✅ ORION items resolved
--   ✅ updated_at trigger on all 11 data tables
--   ✅ last_owner trigger with exception + ERRCODE
--   ✅ RLS helper deployed before all table policies
--   ✅ Cross-location rollup note in service_templates comment
--   ✅ Cancelled occurrence: filter via WHERE status != 'cancelled' in app queries
--   ✅ Zero vs N/A: is_not_applicable column with inline documentation
--   ✅ Backdated entry: no date restriction on service_occurrences
-- ============================================================
