# SundayTally — "What We Track" Tree — Blueprint Specification

Status: **BLUEPRINT — for Builder approval. No code.** Builds on `MINISTRY_METRIC_TREE_CONCEPT.md`.
Blueprint voices: RULE → SCHEMA → FLOW → SCREEN → FUNNEL → WIRE → GROVE, led by PRODUCT, gated by SAGE.
Date: 2026-06-07.

> Make service/ministry/metric setup one easy tree for non-technical admins. Sits on existing tables. One small optional security migration only.

---

## RULE — Decision register (locked in BOT review)
- **R-1** Ministry = Group = one `service_tags` node (nestable via `parent_tag_id`). Same table; UI word flexible. "Sub-tag" retired.
- **R-2** Tree = branches (`service_tags`) + leaves (`metrics`). Two tables, one tree view.
- **R-3** 4 fixed **Kinds** (Attendance / Volunteers / Giving / Stats = the `reporting_tags`). A Count belongs to exactly one Kind; users never invent a Kind.
- **R-4** Two log modes: **Per-service** (`metrics.scope='instance'`, attaches to a `service_instance`) and **Weekly** (`scope='period'`, attaches to a week). Giving + Life Groups = Weekly.
- **R-5** "Track separately → own node." Anything you want broken out is its own ministry/group node.
- **R-6** Hide engineer concepts: `is_canonical` auto-picked (first per Kind), `scope` inferred (service vs weekly), no "tag/sub-tag" wording.
- **R-7** Permissions: owner/admin edit the tree (create/rename/nest/deactivate ministries + counts); editor/viewer read-only. (DS gate hides controls; DB should enforce — see SCHEMA.)
- **R-8** "Add a ministry/group" and "add a count" are lightweight (name → sensible default), scale to many.
- **R-9** Life Groups counts are **Weekly** (`period`). Today they were seeded `instance` with no service → the snag this fixes.
- **R-10** Retire `/settings/stats`, `/settings/volunteer-roles`, `/settings/giving-sources` (they write dropped tables) — fold into the tree.

---

## SCHEMA — data reality (verified live 2026-06-07)
**No migration is required for functionality.** Tables already present and correct:
- `service_tags` (nodes): `id, church_id, code, name, tag_role, parent_tag_id, is_active, display_order`. RLS: split SELECT/INSERT/UPDATE but **church-isolation only — NOT role-gated** (corrected by BOT review; any member can write). Writes work, but needs an owner/admin policy — see Addendum C1. ⚠️
- `metrics` (counts/leaves): `ministry_tag_id, reporting_tag_id, scope('instance'|'period'), is_canonical, is_active, code, name, cadence`. RLS: **only `church_isolation` (ALL)** — writes work but are **not owner/admin-gated at the DB.**
- `reporting_tags` (the 4 Kinds): system-seeded, protected by trigger.
- Counts at write-time land in `metric_entries` (instance via `service_instance_id`, weekly via `period_anchor`).

**Only data touch:** set `metrics.scope` correctly (weekly for no-service ministries) — a column *value*, not a schema change.

**One optional security migration (flag, coordinate with the 0032 chat):** add an owner/admin write policy on `metrics` (the *definition* table) so editors/viewers can't mutate the catalog via the SDK. Same pattern as 0029/0031/0032. Not required for the feature to work; required for tight permissions. **NEEDS-APPROVAL when written.**

---

## FLOW — journeys
- **J-1 Add a ministry/group:** Settings → What we track → "+ Add" → name + role (Adults/Kids/Youth/Other) + Per-service or Weekly → appears as a node (auto-seeded with an Attendance count).
- **J-2 Nest a group:** drag a node onto another (or "Move under…") → sets `parent_tag_id`.
- **J-3 Add a count / volunteer type / stat:** select a node → under a Kind, "+ Add a count" → name (e.g. "Band") → `metrics` row created under that Kind.
- **J-4 Attach a ministry to a service:** from a service (or in J-1), pick which services count it → `service_template_tags`. (Weekly ministries skip this.)
- **J-5 Per-service weekly entry:** open a service for a date → fill its ministries' counts (existing /entries).
- **J-6 Weekly entry (new):** a "This week" section → Giving (one number) + Life Groups (each group's attendance) → writes `period` metric_entries.
- **J-7 Retire screens:** `/settings/{stats,volunteer-roles,giving-sources}` → redirect into What-we-track (or remove from nav).

---

## SCREEN — inventory + element maps

### S1 · "What we track" tree editor (NEW) — route `/settings/track`, nav "What we track"
Two-pane: tree (left) + selected-node detail (right). Owner/admin editable; others read-only.
- **E-1** Tree panel: nodes with indent for nesting, expand/collapse, drag handle.
- **E-2** "+ Add ministry/group" (top).
- **E-3** Node row: name · role chip (Adults/Kids/Youth/Other) · mode chip (Per-service / Weekly) · count summary ("Attendance, Volunteers, Stats").
- **E-4** Nest interaction: drag-to-nest **and** a keyboard/click "Move under…" fallback (a11y).
- **E-5** Detail header (selected node): editable name, role, mode (Per-service/Weekly), "attach to services" (J-4, per-service only).
- **E-6** Kind sections: Attendance · Volunteers · Giving · Stats (Giving shown only where it applies).
- **E-7** "+ Add a count" per Kind → inline name input.
- **E-8** Count row: name · rename (pencil) · deactivate · drag-reorder. Headline (★) auto, not user-set.
- **E-9** Empty/seed state: a new node shows its auto Attendance count + "add more".
- **E-10** Read-only mode for editor/viewer (no controls).
- Reuse: Entries/Settings primitives (cards, accent bars, Ico, DS-2 no-red, Fira numerals).

### S2 · Weekly entry section (NEW, inside `/entries`)
- **E-20** "This week" panel beside the per-service entry.
- **E-21** Giving row (one number).
- **E-22** Life Groups block: each group → attendance input (+ optional volunteers/decisions). "+ add a group" inline (J-1 lightweight).
- **E-23** Save → `metric_entries` with `period_anchor` = week's Sunday.

### S3 · Add-service "what do you count?" step (EXTEND existing `/settings/services/new`)
- **E-30** Step 3 after name+ministry+cadence: the ministries' default counts shown, pre-checked, editable. Confirms/adjusts the auto-seed so create→track→entry is one path.

### Retire
- **E-40** `/settings/stats`, `/settings/volunteer-roles`, `/settings/giving-sources` → redirect to S1 (or remove nav entries). Kills the dropped-table bug.

---

## WIRE — server actions / endpoints (all owner/admin gated server-side)
- `createMinistry(name, role, mode)` → `service_tags` insert (+ auto Attendance `metrics` row; `scope` from mode).
- `updateMinistry(id, {name?, role?, parent_tag_id?, mode?})` → `service_tags` update (nest = set parent; mode change = update child `metrics.scope`).
- `deactivateMinistry(id)` → soft-delete (`is_active=false`).
- `addCount(ministryId, kind, name)` → `metrics` insert (reporting_tag = kind, scope from ministry mode, is_canonical if first of kind).
- `renameCount(metricId, name)` / `deactivateCount(metricId)` / `reorderCounts(...)`.
- All reuse the existing `saveScheduleAction` (cadence) + the per-ministry composition writes already in `settings/services`.
- Weekly entry save → `metric_entries` upsert with `period_anchor`.

---

## GROVE — copy (plain, churchy, no jargon)
- Page: **"What we track"**. Node add: **"Add a ministry or group"**. Count add: **"Add something to count"**.
- Kinds shown as: **Attendance · Volunteers · Giving · Stats**. Mode: **"Counts each service"** vs **"Counts once a week"**.
- Nest hint: **"Drag a group under another to nest it."** No "tag", "metric", "canonical", "scope".

---

## Phasing
- **Phase 1 (core):** S1 tree editor (view + add/rename/deactivate counts + add/nest ministries) + retire the 3 broken screens + S3 add-service step. Delivers "add volunteer types/stats" + fixes the bug.
- **Phase 2:** S2 Weekly entry section + Life Groups scope rework (R-9) + drag-and-drop polish + the optional `metrics` RLS migration.

---

## Open decisions (Builder)
1. Weekly container: no-service ministry = top-level `service_tags` logged weekly (lean) vs a scheduleless `service_template`.
2. Life Group child counts: Attendance-only default (lean) vs include Volunteers/Decisions.
3. Nest depth: arbitrary (lean, UI defaults to 2 levels).
4. Apply the optional `metrics` owner/admin RLS migration now or fold into the 0032 chat's work.

---

## SAGE gate
This is a new nav surface + interaction model. **Builder approves this Blueprint → then a Sub-Agent build (Phase 1 first), FELIX + LENS gated.** Disjoint from the 0032 occurrence/RLS chat except the shared RLS item — coordinate that one. Nothing ships without SAGE.

---

## ADDENDUM — BOT REVIEW v2 (2026-06-07) · Verdict: SOUND-WITH-CHANGES
Two independent read-only reviews (AXIOM+STRATA on claims/schema; STEEL+QUINN+NOVA on breakage/feasibility) pressure-tested this spec against live code + DB. Model is correct; no functional migration for Phase 1. Apply these:

**Corrections to this spec**
- **C1 (spec was WRONG):** `service_tags` write RLS is **church-isolation only, NOT role-gated** — same as `metrics`. **BOTH** tables need an owner/admin write policy (+ a WITH CHECK on `service_tags_update`). → one migration (0033-style), **REQUIRED before release** (not "optional"). Coordinate with the 0032 chat.
- **C2:** `addCount()` MUST guard `is_canonical` — SELECT the existing canonical for (church, ministry, Kind) first; set `true` only if none exists, else the partial unique index `uq_metric_canonical` throws. Default `false`.
- **C3:** Import (stageB `upsert_metric`) can collide with a manually-added canonical on re-import — it must SELECT the existing canonical before promoting. Fix alongside the 0032/import work.
- **C4:** `/settings/volunteer-roles` is *double*-broken (also selects dropped `tag_name`). Retiring it moots this.
- **C5:** `ATTENDANCE.agg_default = avg` (the other 3 Kinds = sum). Tree/Kind UI + any rollup must respect it.

**Blockers — Phase 2 only (Phase 1 is unaffected)**
- **B1 (BLOCKER for weekly):** period-scoped **ATTENDANCE has no path to the dashboard/History today** — only GIVING has a period fallback in `dashboard.ts`; attendance is 100% occurrence-based. So Life Groups *weekly* attendance would be **entered-but-invisible (reported as 0).** Before S2/Life-Groups ships, DECIDE the mechanism: (a) add a period-attendance fetch to `fetchDashboardData()` and merge into the weekly maps, or **(b) a separate "Weekly ministries" section (recommended — cleaner, no double-count).**
- **B2:** Life Groups scope rework is a **data migration**, not a value tweak — flip existing metrics `instance→period` AND migrate/clear their existing `metric_entries` (XOR constraint).

**Revised phasing**
- **Phase 1 — SOUND, proceed** (after IRIS map + C1/C2): tree editor for **per-service** ministries (Experience/LifeKids/Switch — all instance-scoped, already reach the dashboard) + add/rename/deactivate counts + **retire the 3 broken screens FIRST** + S3 add-service step. Ship with the **keyboard "Move under…"** nesting only — no drag-and-drop library is installed; drag is later polish. Sizes: S1=M (no drag), S2=M, S3=M, retire=S.
- **Phase 2 — gated on B1 decision + B2 migration:** Weekly entry (S2) + Life Groups period model. Do NOT build until B1 is specified.
