## Status: Complete (design) — Pending build
## Version: 1.0
## Pending revisions: ministry-create scope (N-7) + team default-campus write path (N-8) finalize at build
## Last updated: 2026-06-03

# IRIS Element Map — SETTINGS screen (#61 hub + Services & Ministries + Locations & Team)

**Owner:** IRIS · **Build lead:** NOVA · **Gate:** SAGE
**Reference (wired, verified):** Entries screen `sunday-tally/src/app/(app)/entries/page.tsx` + `entries/ui.tsx` (REUSE its primitives)
**UI rules:** `DESIGN_SYSTEM.md` (DS-1..DS-25) — follow exactly. **DS-25:** settings must *visually mirror the entry structure they configure.*
**Target routes (build):**
- `/(app)/settings` — Settings hub (REDESIGN existing `settings/page.tsx`)
- `/(app)/settings/services` — Services & Ministries (NEW)
- `/(app)/settings/locations` — Locations & Team (NEW)
- `/(app)/settings/tags` — Ministry Tags (EXISTING #61, on new schema — leave as-is, hub links to it)

**Design decisions:** D-073, D-075, D-076, D-079, D-086, D-088 in `SCHEMA_CUTOVER_STATUS.md` (read first).

> Everything is schema/config-driven. Demo values (Experience / LifeKids, Main Campus) are placeholders
> in dynamic slots — a church with different services/ministries/campuses renders a different screen
> from the same code. **No hardcoded ministry / metric / church / campus names.**

---

## Purpose & Core Loop
An owner/admin configures the church so the Entries screen renders correctly. The two screens are a
matched pair: **what you compose here is what you enter there.** Services & Ministries decides which
ministry cards appear under each occurrence (`service_template_tags`); Locations & Team decides which
campus each member lands on (`church_memberships.default_location_id`) and what campuses exist
(`church_locations`). The hub is a clean index that role-gates the config sections.

## Roles (church_memberships.role)
| Role | Settings hub | Services & Ministries | Locations & Team |
|---|---|---|---|
| owner / admin | Full read + write | add/remove ministry from template, reorder, create ministry | add/edit/deactivate campus, set any member's default campus + role |
| editor | Read config sections; **config rows disabled** (sees structure, cannot mutate) | read-only | read-only; **may set own default campus** (D-088, see O-2) |
| viewer | Hub shows only non-config rows (e.g. own profile); config sections **hidden or read-only** | read-only / hidden | read-only; may set own default campus only |

> Gating mirrors Entries N-9: non-owner/admin = inputs disabled, destructive controls hidden. No red anywhere (DS-2).

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| Church | session → `church_memberships` | tenant scope (`church_id`) on every query |
| Role | `church_memberships.role` | drives gating table above |
| Self | `auth.getUser().id` | "you" badge on the member row; the only row editor/viewer may edit (O-2) |

## Data Dependencies (all live post-0028 — no new schema required for MVP scope)
- `service_templates` (id, church_id, location_id, display_name, primary_tag_id, sort_order, is_active)
- `service_template_tags` (id, church_id, service_template_id, ministry_tag_id, sort_order, UNIQUE(template,tag)) — **the composition link this screen writes** (D-073)
- `service_tags` (id, church_id, code, name, tag_role['ADULT_SERVICE'|'KIDS_MINISTRY'|'YOUTH_MINISTRY'|'OTHER'], parent_tag_id, is_custom, display_order, is_active) — the ministries
- `church_locations` (id, church_id, name, code, is_active, sort_order)
- `church_memberships` (id, church_id, user_id, role, is_active, default_location_id) + `user_profiles` (id, full_name) for display
- Read-only context: `metrics` (to surface "N metrics" per ministry; never edited here — that's a future Metrics screen)

---

## SCREEN 1 — Settings Hub (`/settings`)

### Element Map
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | Sticky header "Settings" + "ST" brand mark | `churches.name` (eyebrow) | — | all |
| E-2 | Section "Your Church" | static group | — | all |
| E-3 | Row → Services & Ministries (`/settings/services`) | count: # active `service_templates` | chevron; **owner/admin** interactive, others muted "view only" | gated |
| E-4 | Row → Locations & Team (`/settings/locations`) | count: # active `church_locations` + # active members | chevron | gated |
| E-5 | Row → Ministry Tags (`/settings/tags`) [EXISTING] | count: # active `service_tags` | chevron | gated |
| E-6 | Section "Data" → AI Data Import (`/onboarding/import`) | — | chevron | owner/admin |
| E-7 | Broken-section guard | — | sub-pages still on dropped tables (volunteer-roles, stats, giving-sources, tracking, team-old) are **NOT linked** from the redesigned hub until rebuilt (N-6) | — |

> Hub uses the same card/section grammar as the existing `SettingsRow`/`Section` (rounded-2xl, divide-y) but
> restyled to DS tokens (slate-200 borders, brand-blue hover/focus rings, SVG chevron — no emoji). Counts are
> derived and quiet (DS-9): e.g. "3 services · 2 ministries each". Role gating greys non-permitted rows with a
> small "View only" slate tag (DS-16), never hides the church's own structure from an editor.

---

## SCREEN 2 — Services & Ministries (`/settings/services`)
> **DS-25 mirror:** this screen looks like the Entries Occurrence view — each service is a card, its ministries
> are equal-peer child rows with the same accent bar + "· role" label. Configuring feels like entering.

### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Back chevron → `/settings` | — | — | all |
| E-11 | Title "Services & Ministries" + church eyebrow | `churches.name` | — | all |
| E-12 | Helper line | static copy | — | all |

### Zone B — Service list (one card per template)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-20 | Service card (×template) | `service_templates` WHERE church_id, is_active ORDER BY sort_order | — | all |
| E-21 | Service name + campus meta | `display_name` · `church_locations.name` via `location_id` (plain "· Campus" muted, DS-8) | — | all |
| E-22 | Ministry child row (×row in template) | `service_template_tags` JOIN `service_tags`, ORDER BY sort_order | accent bar by `tag_role` (accentForRole) + "· role" (roleLabel) | all |
| E-23 | Ministry metric count (quiet) | COUNT(`metrics` WHERE ministry_tag_id, is_canonical, is_active) | derived, muted "N metrics" (DS-9/DS-16) | all |
| E-24 | Reorder handles (↑/↓ or drag) | rewrites `service_template_tags.sort_order` within the template | disabled for non-owner/admin | owner/admin |
| E-25 | Remove-ministry control | DELETE `service_template_tags` row (template,tag) | **hidden for non-owner/admin**; confirm inline (no red — slate "Remove", amber confirm) | owner/admin |
| E-26 | "Add ministry" control on a card | opens E-27 picker | hidden for non-owner/admin | owner/admin |
| E-27 | Add-ministry picker | active `service_tags` NOT already linked to this template | INSERT `service_template_tags` (church_id, template_id, ministry_tag_id, next sort_order); idempotent on UNIQUE(template,tag) | owner/admin |
| E-28 | "Create a new ministry" affordance (in picker) | links to `/settings/tags` (canonical create) OR inline quick-create (N-7, OPEN) | — | owner/admin |
| E-29 | Service card status circle (DS-6) | derived: **complete**=≥1 ministry linked · **needs**(amber outline)=0 ministries (won't render in Entries) · never red | — | all |
| E-30 | Empty state | no active templates | "No services yet — create them in onboarding / schedule." (no red) | all |

> **Composition is template-level, not per-occurrence (D-075):** edits here change every future week's
> Entries render for that service; a one-off skip is `is_not_applicable` on Entries, never a re-tag here.
> Ministries are **equal peers (D-076)** — no "primary" badge in the UI even though `primary_tag_id` still
> exists physically. `parent_tag_id` rollups are managed on the Tags screen, not here.

---

## SCREEN 3 — Locations & Team (`/settings/locations`)

### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-40 | Back chevron → `/settings` | — | — | all |
| E-41 | Title "Locations & Team" | `churches.name` eyebrow | — | all |

### Zone B — Campuses (`church_locations`)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-50 | Campus row (×location) | `church_locations` WHERE church_id ORDER BY sort_order | active / inactive (muted) | all |
| E-51 | Campus name (inline edit) | `church_locations.name` via `InlineEditField` | save-on-blur (shared component) | owner/admin |
| E-52 | Campus code (read-only meta) | `church_locations.code` | quiet slate (DS-16); immutable in UI | all |
| E-53 | Deactivate / reactivate campus | UPDATE `is_active` (soft only — FK RESTRICT means never hard-delete) | hidden for non-owner/admin; no red | owner/admin |
| E-54 | Add campus | INSERT `church_locations` (church_id, name, code=slug(name) unique per church, next sort_order) | owner/admin; idempotent guard on uq_location_code | owner/admin |
| E-55 | Reorder campuses | rewrite `sort_order` | owner/admin | owner/admin |
| E-56 | Duplicate-empty-campus note | O-4 from Entries map (D-086 demo cleanup) — surface but don't auto-delete | — | owner/admin |

### Zone C — Team (`church_memberships`)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-60 | Member row (×membership) | `church_memberships` WHERE church_id, is_active, JOIN `user_profiles(full_name)` | "You" badge when user_id = self | all |
| E-61 | Member name + role meta | `user_profiles.full_name` · role label (plain "· Admin" DS-8) | — | all |
| E-62 | Default-campus picker (per member) | `church_memberships.default_location_id`; options = active `church_locations` | UPDATE on change; null = falls back to first active campus (matches Entries N-5) | owner/admin = any member; editor/viewer = **own row only** (O-2) |
| E-63 | Role picker (per member) | `church_memberships.role` (owner/admin/editor/viewer) | UPDATE; cannot demote last owner (guard) | owner/admin; **not on own row if last owner** |
| E-64 | Deactivate member | UPDATE `is_active=false` (soft) | hidden for non-owner/admin; cannot deactivate self/last owner; no red | owner/admin |
| E-65 | Invite member affordance | links to existing invite flow (T9 / `church_invites`) — not rebuilt here | owner/admin | owner/admin |
| E-66 | Empty / single-member state | — | "Just you for now." | all |

> Campus is a **dimension, not a sub-entity (D-086)** — definitions are church-wide; location only scopes
> `service_instances`/`metric_entries`. So this screen edits the campus *list* + each member's *default*,
> not per-campus copies of services or metrics. The default-campus picker is the authoritative control the
> Entries header pill (E-2 there) only *reflects* (DS-13).

---

## Shared components (REUSE — do not duplicate)
| Component | Source | Use here |
|----|---------|-----------|
| `Dot` (status circle, DS-6/E-50) | `@/app/(app)/entries/ui` | E-29 service-card completeness |
| `accentForRole`, `roleLabel` | `@/app/(app)/entries/ui` | E-22 ministry rows mirror Entries cards |
| `Ico` (SVG icon set), `fmt` | `@/app/(app)/entries/ui` | chevrons, check, pin, counts (DS-14) |
| `InlineEditField` | `@/components/shared/InlineEditField` | E-51 campus name, E-61 names (same as Tags screen) |
| `AppLayout` | `@/components/layouts/AppLayout` | wrap every page `<AppLayout role={role}>` |

> If any Entries primitive needs to live in two screens cleanly, factor it into a tiny shared module and
> update the Entries imports too (per guardrail 2) — otherwise import from `entries/ui` directly.

---

## NOVA Items (build tasks / risks)
- **N-1** Hub redesign: restyle existing `SettingsRow`/`Section` to DS tokens (slate borders, brand focus rings, SVG chevrons), add derived counts, role-gate config rows (greyed "View only", not hidden, for editors). Don't relink the still-broken sub-pages (N-6).
- **N-2** Services & Ministries CRUD on `service_template_tags`: add (INSERT idempotent on UNIQUE(template,tag)), remove (DELETE row), reorder (rewrite sort_order within template). Optimistic + confirmed, mirror Entries autosave UX. **TR-01: `service_templates`/`service_template_tags` feed the god node `service_instances` and the Entries render — read the graph before changing the link semantics.**
- **N-3** Mirror the Entries Occurrence visual structure (DS-25): service = card, ministries = equal-peer accent-bar rows; no "primary" badge (D-076).
- **N-4** Locations CRUD on `church_locations`: inline-edit name, add (slug code, guard uq_location_code), soft deactivate only (FK RESTRICT — never hard delete), reorder.
- **N-5** Team: default-campus picker writes `church_memberships.default_location_id`; role picker writes `role`; soft-deactivate. Guards: cannot demote/deactivate the last owner; cannot deactivate self into lockout.
- **N-6** Do NOT attempt to fix the broken legacy sub-pages tonight (volunteer-roles, stats, giving-sources, tracking, old team) — they reference dropped tables. Leave them unlinked; flag for a later pass.
- **N-7** Ministry create-in-place (E-28): MVP can link out to `/settings/tags` (which already creates `service_tags`). Inline quick-create is OPEN — decide at build whether to duplicate the slugify/insert logic or just deep-link.
- **N-8** Role gating throughout: owner/admin = full write; editor = read config + own default campus; viewer = read/own default only. Inputs `disabled`, destructive controls hidden. No red (DS-2).
- **N-9** All reads: tenant-scope by `church_id`; these lists are small but **still `.order()` deterministically and stay under the 1000-row cap** (the History bug, D-063 — no unbounded reads).

## Query Patterns to author (→ QUERY_PATTERNS.md)
QP-SET-TEMPLATES (active service_templates + location name) · QP-SET-TEMPLATE-MINISTRIES (service_template_tags JOIN service_tags, by sort_order) · QP-SET-MINISTRY-METRIC-COUNT (canonical metrics per tag) · QP-STT-LINK (insert composition, idempotent) · QP-STT-UNLINK (delete composition) · QP-STT-REORDER (sort_order rewrite) · QP-SET-LOCATIONS (church_locations by sort_order) · QP-LOC-UPSERT / QP-LOC-DEACTIVATE · QP-SET-MEMBERS (church_memberships JOIN user_profiles) · QP-MEMBER-DEFAULT-CAMPUS (update default_location_id) · QP-MEMBER-ROLE (update role, last-owner guard). All: tenant + active filters, deterministic order, bounded.

## Completion / empty states
- Service card with **0 ministries** → amber-outline status circle (E-29) + helper "Add a ministry so this service appears in Entries." (the actionable signal — NULL≠error, no red).
- No services / no campuses / single member → quiet slate empty copy (DS-23), never a bordered "warning" card.
- Save confirmation reuses the Entries quiet "Saved ✓" sage pattern; reorder/add/remove are optimistic with rollback on error (mirror Entries N-2).

## Open Items
- **O-1** Ministry inline quick-create vs deep-link to `/settings/tags` (N-7) — confirm at build.
- **O-2** May an **editor** set their *own* default campus, or owner/admin only? Entries D-088 implies per-user; proposed: editor/viewer can set own row, owner/admin can set anyone's. Confirm.
- **O-3** Reorder UX: ↑/↓ buttons (simplest, a11y-friendly, matches no-extra-deps) vs drag — proposed ↑/↓.
- **O-4** Demo duplicate-empty "Main" `church_locations` row (D-086) — surface for manual cleanup; do not auto-delete (FK RESTRICT).
- **O-5** Legacy broken sub-pages (volunteer-roles, stats, giving-sources, tracking) — schedule a rebuild pass; out of tonight's scope (N-6).

## Flagged migrations
**NONE.** All three screens are fully buildable on the post-0028 live schema (service_template_tags,
church_locations, church_memberships.default_location_id all exist). No migration written or needed for MVP scope.

## Decision References
D-073 (service_template_tags composition) · D-075 (template-level, not per-occurrence) · D-076 (equal-peer ministries, no primary badge) · D-079 (per-ministry metrics; settings mirror entry) · D-086 (locations = dimension, church-wide definitions) · D-088 (per-user default location) · DS-25 (settings mirror entry structure) · DS-2/DS-6/DS-8/DS-9/DS-13/DS-16 (no red · status circles · plain category labels · derived≠input · context pills · neutral metadata).
