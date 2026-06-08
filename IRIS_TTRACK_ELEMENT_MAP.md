# IRIS Element Map — T_TRACK · "What We Track" tree editor
Screen: `/settings/track` · Status: SPEC for Phase 1 build · 2026-06-07
Source: MINISTRY_METRIC_TREE_BLUEPRINT.md (S1) + BOT review v2 corrections. Build must match this map (One Rule).

## Purpose
One screen to see and edit a church's whole tracking structure as a tree:
**Ministry/Group (service_tags) → Kind (1 of 4) → Count (metrics leaf).** Replaces the
3 dropped-table screens. Phase 1 = per-service ministries (instance-scoped); weekly/Life-Groups is Phase 2.

## Roles (R-7)
- **owner / admin:** full edit. · **editor / viewer:** read-only (no add/edit/▾ controls rendered).
- Server actions re-check role (owner/admin) — UI gate is not the authority.

## Layout
Two-pane (desktop) / stacked (mobile). Left = tree. Right = selected node detail. Header = title + "Add ministry".

## Elements
- **E-1 · Header** — eyebrow "Settings", H1 "What we track", one-line helper: "Each ministry and the numbers you count for it."
- **E-2 · "Add ministry or group" button** (owner/admin only) → inline create row: name (req) + role select (Adults / Kids / Youth / Other) → creates a `service_tags` node, auto-seeds an Attendance count, selects it. Copy: button "Add ministry or group".
- **E-3 · Tree panel (left)** — nodes in `display_order`, child nodes indented under parent (`parent_tag_id`). Each node row:
  - name · role chip (Adults/Kids/Youth/Other, accent by role — reuse `accentForRole`) · count summary ("Attendance · Volunteers · Stats") · ▾ actions (owner/admin).
  - expand/collapse caret when it has children. Selected node highlighted.
- **E-4 · Nest control (NO drag in Phase 1)** — each node ▾ menu: "Move under…" → list of eligible parents (+ "Top level"). Sets `parent_tag_id`. (Drag-and-drop is Phase 2 polish; no DnD lib installed.)
- **E-5 · Detail header (right)** — selected node: editable name (InlineEditField), role select, and a read-only mode chip ("Counts each service" — Phase 1 is all per-service). "Deactivate ministry" (soft-delete `is_active=false`, confirm dialog).
- **E-6 · Kind sections** — three sections for Phase 1: **Attendance · Volunteers · Stats** (Giving is church-wide, not shown per-ministry here). Each section header names the Kind; under it, its Counts.
- **E-7 · "Add a count" (per Kind, owner/admin)** — inline name input → creates a `metrics` row (reporting_tag = that Kind, scope='instance'). Copy: "+ Add a count".
- **E-8 · Count row** — name · headline marker (★, read-only, auto) · rename (pencil, InlineEditField) · "Remove" (soft-delete `is_active=false`). Reorder via ▴▾ (a11y) within a Kind.
- **E-9 · Empty states** — node with only the seeded Attendance count shows it + "Add more above". No ministries yet → "Add your first ministry."
- **E-10 · Read-only mode** — editor/viewer see the tree + counts, no Add/▾/pencil/Remove controls.

## Hard rules (from BOT review — the build MUST honor)
- **C2 — canonical guard:** when creating a Count, set `is_canonical=true` ONLY if no active canonical exists for (church, ministry, Kind); else `false`. The partial unique index `uq_metric_canonical` throws otherwise. Never expose ★ as a user toggle in Phase 1.
- **C5 — ATTENDANCE aggregates as `avg`** (others `sum`) — display/rollup elsewhere must respect; this screen just lists counts.
- **Scope = 'instance'** for all Phase-1 counts (per-service ministries). No weekly/period here (Phase 2).
- **Tenancy:** every insert/update carries `church_id`; service_template_tags untouched here (composition stays on /settings/services).

## Server-action contract (`settings/track/actions.ts`, all owner/admin re-checked)
- `createMinistry({name, tag_role})` → service_tags insert (+ auto Attendance metric via canonical guard) → returns node.
- `updateMinistry(id, {name?, tag_role?, parent_tag_id?})` → service_tags update.
- `deactivateMinistry(id)` → is_active=false.
- `addCount({ministryId, reportingTagCode, name})` → metrics insert (scope='instance', canonical per C2).
- `renameCount(metricId, name)` · `deactivateCount(metricId)` · `reorderCounts(ids[])`.

## DS / reuse
Reuse Entries/Settings primitives (cards, `InlineEditField`, `Ico`, `accentForRole`, status circles). DS-2 no-red. Fira numerals where numbers appear. Match the look of `/settings/services` + `/settings/tags`.

## Nav
Add a "What we track" entry to the Settings hub (`/settings`). Retire links to stats/volunteer-roles/giving-sources.

## Gate
FELIX (server actions + canonical guard + role re-check + tsc/build) → LENS (render vs this map) → SAGE. RLS hardening (owner/admin write policies on service_tags + metrics) is a separate NEEDS-APPROVAL migration coordinated with the 0032 chat — not built here.
