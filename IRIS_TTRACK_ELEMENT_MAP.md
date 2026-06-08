# IRIS Element Map — T_TRACK · "What We Track" tree editor
Screen: `/settings/track` · Status: BUILT (Phase A overhaul) · 2026-06-08
Source: MINISTRY_METRIC_TREE_BLUEPRINT.md + roll-up overhaul (plan: lively-sparking-catmull). Build must match this map (One Rule).

## Purpose
One screen to set a church's whole tracking structure as a tree:
**Node (service_tags, nestable) → Kind (Attendance/Volunteers/Stats) → Metric.**
A node can be a pure **container** (holds child groups, no metrics of its own).
A metric is **Entry** (typed at its node) or **Roll-up** (sums/avgs/maxes the
children that point at it). Children point up EXPLICITLY (parent_metric_id).
This is the editor that produces the structure the History grid renders.

## Roles (R-7)
- **owner / admin:** full edit. · **editor / viewer:** read-only (no controls).
- Every server action re-checks owner/admin (`requireOwnerAdmin`) — UI gate is not the authority.

## Layout
Two-pane (desktop) / stacked (mobile). Left = tree (drag-to-nest). Right = selected node detail.

## Elements
- **E-1 · Header** — eyebrow "Settings", H1 "What we track", helper "Each ministry, the groups inside it, and the numbers you count."
- **E-2 · "Add ministry or group"** (owner/admin) → inline form: name + role (Adults/Kids/Youth/Other) → creates a top-level `service_tags` node, auto-seeds an Attendance **entry** metric, selects it.
- **E-3 · Tree panel (left)** — nodes in `display_order`, children indented under parent. Each row: **drag handle** (⋮⋮, owner/admin) · caret (if children) · root-colored accent bar · name · role pill · **⚠** if any roll-up on the node is unreferenced · count/group summary. Selected row highlighted with the node's root color.
- **E-4 · Nesting** — two ways: (a) **drag-and-drop** via @dnd-kit (drag a node's handle onto another node to nest, or onto the "Top level" drop strip to un-nest); (b) **"Move under…"** menu (the ▾ on each row) — **rendered in a portal** so it is never clipped by the tree column; keyboard/click a11y fallback. Descendant drops are rejected.
- **E-5 · Detail header (right)** — root-colored accent, editable name (InlineEditField), role select, "Remove ministry" (amber confirm; server child-guard blocks if it has active children).
- **E-6 · "Groups inside" card** — lists child nodes (click to **drill in**), with "Add a group inside [name]" (owner/admin) that creates a child `service_tags` node (parent_tag_id set). Shows for any node with children, or for owner/admin on any node.
- **E-7 · Kind sections** — Attendance · Volunteers · Stats. A Kind section renders **only when it has ≥1 metric** (no forced empty sections). Container nodes show none.
- **E-8 · "Add a count"** (owner/admin) — pick a Kind (dropdown) + name → creates a `metrics` row (scope='instance', mode='entry', canonical per C2 guard).
- **E-9 · Metric row** — name (InlineEditField) · ★ canonical (read-only, auto) · **mode toggle Entry / Roll up children** · Remove (amber confirm). Second line:
  - **Entry ("Typed")** → "Rolls up into → [picker]": eligible ancestor roll-ups of the **same Kind**, or "— stays local —". If none eligible, hint to make a roll-up on a parent first.
  - **Roll-up** → "Combines its children: [Sum/Average/Largest]" + child-count, or **amber "⚠ Nothing points up to this yet"** when unreferenced. No value field (it's computed, Phase B).
- **E-10 · Read-only mode** — editor/viewer see tree + groups + metrics with no controls (no handles, toggles, pickers, add/remove).

## Hard rules (the build honors these)
- **C2 — canonical guard:** a new metric is `is_canonical=true` ONLY if no active canonical exists for (church, ministry, Kind); else false. ★ is never a user toggle.
- **Mode/link rules (server-enforced in actions.ts):** only an `entry` metric may point up; a child may point only to a roll-up of the **same Kind** on an **ancestor** node; rollup→entry is **blocked while children still point at it**; a roll-up defaults to `sum`.
- **Auto-wire:** adding a node under a parent that has an active ATTENDANCE roll-up auto-points the new node's seeded Attendance at it (nearest ancestor wins; still unwireable).
- **Scope = 'instance'** for all metrics here. Giving stays church-wide (not shown here).
- **Tenancy:** every insert/update carries `church_id`.
- **Defensive load:** the metrics fetch falls back to base columns if 0034 (mode/rollup_op/parent_metric_id) isn't applied yet, treating all metrics as 'entry' — the page never hard-breaks pre-migration.
- **History/reporting protection:** roll-up metrics are filtered out (`.neq('mode','rollup')`) of the History grid (`derive_grid_config`), weekly entry (`entries/page`), and dashboard (`dashboard.ts`, `dashboardDrilldown.ts`) so they never surface as empty editable columns/inputs. They become computed columns only in Phase B. Nesting/mode changes never alter `metric_entries` or how existing entries flow.

## Server-action contract (`settings/track/actions.ts`, all owner/admin re-checked)
- `createMinistry({name, tag_role, parent_tag_id?})` → service_tags insert (+ auto Attendance entry metric, auto-wired to ancestor roll-up when present).
- `updateMinistry(id, {name?, tag_role?, parent_tag_id?})` · `deactivateMinistry(id)` (child-guard).
- `addCount({ministryId, reportingTagCode, name, mode?, rollupOp?, parentMetricId?})` (C2 guard + parent-link validation).
- `setMetricMode(metricId, mode, rollupOp?)` · `setMetricParent(metricId, parentMetricId|null)` (ancestor + same-Kind validation) · `setRollupOp(metricId, rollupOp)`.
- `renameCount(metricId, name)` · `deactivateCount(metricId)`.

## Schema (migration 0034 — NEEDS-APPROVAL, file only)
Adds to `metrics`: `mode` ('entry'|'rollup', default 'entry'), `rollup_op` ('sum'|'avg'|'max', nullable), `parent_metric_id` (uuid → metrics, ON DELETE SET NULL), with CHECKs + an index. Ancestor/same-Kind guardrails are enforced in actions.ts (need a parent_tag_id walk).

## DS / reuse
Reuse `InlineEditField`, `Ico`, `roleLabel`, and the History palette via `buildGroupColorMap`/`GroupColor` (`@/components/history-grid/group-colors`) so node colors match the History grid. @dnd-kit/core for drag. DS-2 no-red (amber for warnings/removes). Fira numerals on counts.

## Nav
"What we track" entry in the Settings hub. Retired: /settings/{stats,volunteer-roles,giving-sources} (redirect here).

## Phase B (not built here)
Roll-up SUMMATION (a roll-up's computed value) in History/dashboard/entry — on-read recursive aggregation, plus narrowing the importer's `upsert_metric` so re-import can't reset mode/rollup_op/parent_metric_id. Spec in plan lively-sparking-catmull §4.

## Gate
FELIX (server actions + ancestor/Kind validation + role re-check + tsc/lint) → SAGE. Migration 0034 applied only on explicit "apply", coordinated with the 0032/#79 chat (#79 = owner/admin write RLS on service_tags+metrics, still open).
