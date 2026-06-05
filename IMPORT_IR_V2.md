# Import Intermediate Representation — v2 (Unified Tag-First)
## The contract between Stage A (producer) and Stage B / validator / grid (consumers)
## Version 1.0 | 2026-05-29 | Decisions D-062…D-068

> Every implementation sub-agent on the import cutover reads THIS file. It is the
> single source of truth for the shape the AI emits and the deterministic writer
> consumes. Do not infer the IR from old code — the old `dest_field` grammar
> (attendance.*/giving.*/volunteer.*/response.*/period_*) is REPLACED here.

---

## The one idea

The old model had four special-cased data kinds (attendance, volunteers, responses,
giving) each with its own table, plus audience suffixes (MAIN/KIDS/YOUTH). The new
model has **one concept: a metric.**

A **metric** = (ministry_tag × reporting_tag × scope). It is the definition of one
tracked number. A **metric_entry** is a value for that metric on a given service
instance or week.

- *Who* the number is about → the **ministry_tag** (and its `tag_role`).
- *What dimension* it is → the **reporting_tag** (ATTENDANCE / VOLUNTEERS / GIVING / RESPONSE_STAT, or custom).
- *Service-level or church-wide-weekly* → the metric's **scope** (`instance` | `period`).

Audience (main/kids/youth) is NOT a suffix anymore. "Kids attendance" is a metric
whose ministry_tag has `tag_role = KIDS_MINISTRY` and `reporting_tag = ATTENDANCE`.

---

## proposed_setup (entities the AI declares)

```jsonc
{
  "locations": [
    { "name": "Main Campus", "code": "MAIN" }            // code optional; slugged if absent
  ],

  "ministry_tags": [                                      // REPLACES service_tags + tag_relationships
    {
      "code": "ADULT_9AM",                               // slug, unique per church
      "name": "9 AM Service",                            // display
      "tag_role": "ADULT_SERVICE",                       // ADULT_SERVICE | KIDS_MINISTRY | YOUTH_MINISTRY | OTHER
      "parent_code": null                                // adjacency (D-059); null = root. NO closure table, NO effective dates.
    },
    { "code": "LIFEKIDS", "name": "LifeKids", "tag_role": "KIDS_MINISTRY", "parent_code": null },
    { "code": "SWITCH",   "name": "Switch",   "tag_role": "YOUTH_MINISTRY", "parent_code": null }
  ],

  "reporting_tags": [],                                   // USUALLY EMPTY. The 4 system tags
                                                          // (ATTENDANCE, VOLUNTEERS, GIVING, RESPONSE_STAT)
                                                          // are pre-seeded at signup — reference them by
                                                          // code, do NOT declare them. Only list CUSTOM ones:
                                                          // { code, name, unit_kind:"count"|"currency", agg_default:"sum"|"avg" }

  "service_templates": [
    {
      "display_name": "9 AM Service",
      "service_code": "ADULT_9AM",                        // unique; often equals the primary ministry tag code
      "location_name": "Main Campus",                     // resolved to location_code/id
      "primary_tag": "ADULT_9AM",                         // a ministry_tags.code (the service's primary ministry)
      "day_of_week": 0,                                   // 0=Sun … 6=Sat
      "start_time": null                                  // "HH:MM" or null
    }
  ],

  "metrics": [                                            // REPLACES response_categories + volunteer_categories
                                                          //          + giving_sources + the fixed attendance buckets
    {
      "metric_code": "ADULT_9AM__ATTENDANCE",            // slug, unique per church (convention: <MINISTRY>__<REPORTING>[__<SUFFIX>])
      "name": "9 AM Attendance",                         // display
      "ministry_tag": "ADULT_9AM",                       // ministry_tags.code
      "reporting_tag": "ATTENDANCE",                     // reporting_tags.code (one of the 4 system, or a declared custom)
      "scope": "instance",                               // "instance" (per service) | "period" (per church-week)
      "is_canonical": true                               // see canonical rule below
    },
    { "metric_code": "LIFEKIDS__ATTENDANCE", "name": "Kids Attendance", "ministry_tag": "LIFEKIDS", "reporting_tag": "ATTENDANCE", "scope": "instance", "is_canonical": true },
    { "metric_code": "ADULT_9AM__VOL__PARKING", "name": "Parking Team", "ministry_tag": "ADULT_9AM", "reporting_tag": "VOLUNTEERS", "scope": "instance", "is_canonical": true },
    { "metric_code": "ADULT_9AM__VOL__GREETERS", "name": "Greeters", "ministry_tag": "ADULT_9AM", "reporting_tag": "VOLUNTEERS", "scope": "instance", "is_canonical": false },
    { "metric_code": "CHURCH__GIVING_ONLINE", "name": "Online Giving", "ministry_tag": "ADULT_9AM", "reporting_tag": "GIVING", "scope": "period", "is_canonical": true }
  ]
}
```

### Canonical rule (D-066)
At most ONE metric per `(ministry_tag, reporting_tag)` may have `is_canonical = true`
(enforced by a partial UNIQUE index). The canonical metric is the default entry
target and the one a single-column wide import writes into. Convention for the AI:
the first/primary metric for a `(ministry, reporting)` pair is canonical; additional
breakouts (extra volunteer roles, extra stats under the same ministry+dimension) are
`is_canonical: false`. Never mark two canonical for the same pair — the validator
(#57) rejects it.

### tag_role inference (D-068; validated by #57, confirmed in walkthrough #58)
The AI infers `tag_role` from ministry name/context:
- Kids / children / nursery / "LifeKids" → `KIDS_MINISTRY`
- Youth / students / "Switch" / middle/high school → `YOUTH_MINISTRY`
- Main adult service / weekend service / experiences → `ADULT_SERVICE`
- Anything else (parking-lot counts, online, misc) → `OTHER`
When unsure, emit a clarification question rather than guessing (see §clarifications).

**Venue-wide / church-wide metrics (D-068 addendum):** every metric MUST carry a
ministry_tag (`metrics.ministry_tag_id` is NOT NULL). A genuinely church-wide number
(total weekly offering, online viewers, building counts) is assigned to a single
`OTHER`-role ministry tag — convention code `CHURCH_WIDE`, name "Church-Wide". The
grid buckets `OTHER`-role tags into the misc/Stats group. Stage A creates this tag on
demand; Stage B upserts it like any other ministry tag; the grid treats it as misc.

---

## dest_field grammar (column_map[].dest_field)

The entire grammar collapses to four control fields + ONE data field:

```
service_date              — the column holding the row's date
service_template_code     — the column naming which service (optional; else default_service_template_code)
location_code             — optional
ignore                    — skip this column
metric.<METRIC_CODE>      — a data value for that metric
```

That's it. No `attendance.*`, no `giving.*`, no `volunteer.*`, no `response.*`, no
`.AUDIENCE` suffix, no `period_*` prefix. **Instance vs. period is read from the
metric's `scope`, not the column** — the writer looks up the metric and, if
`scope='period'`, snaps the row date to its Sunday (`service_date - DOW`, Sunday=0)
and writes `period_anchor` with `service_instance_id = NULL`; if `scope='instance'`,
it resolves/creates the `service_instance` and writes `service_instance_id` with
`period_anchor = NULL` (XOR enforced by CHECK, D-064).

### sources[] entry (per uploaded source)
| Field | Meaning (unchanged from v1 unless noted) |
|---|---|
| `source_name` | join key to the uploaded source |
| `dest_table` | **DROP this field** — routing is metric-driven now. (If kept for back-compat, it is decorative.) |
| `date_column`, `date_format` | unchanged |
| `default_service_template_code` | fallback occurrence anchor |
| `column_map[]` | `{ source_column, dest_field, notes? }` with the grammar above |
| `tall_format` | see below |

### tall_format (unpivoted sheets)
`area_field_map` now maps each compound key → `metric.<METRIC_CODE>` (instead of the
old kind-prefixed dest_fields). `metric_name_column`, `value_column`,
`audience_column`, `audience_map`, `group_type_column`, `group_context_column` keep
their roles, but their job is now to resolve a row to a **metric** (ministry from
group_context/audience, reporting from group_type/metric_name). Longest-key-first
resolution unchanged.

---

## Stage A → Stage B write contract

### Phase 1 — entity writer tools (the grammar Haiku speaks)
| Tool | Params | Target |
|---|---|---|
| `upsert_location` | name, code | `church_locations` |
| `upsert_ministry_tag` | code, name, tag_role, parent_code? | `service_tags` (resolves parent_code→parent_tag_id; sets tag_role). REPLACES upsert_service_tag + upsert_tag_relationship |
| `upsert_reporting_tag` | code, name, unit_kind, agg_default | `reporting_tags` (custom only; NEVER touches is_system rows) |
| `upsert_service_template` | service_code, display_name, location_code, primary_tag_code, day_of_week?, start_time? | `service_templates` (primary_tag_code→service_tags.id) |
| `upsert_service_schedule_version` | service_code, location_code, day_of_week, start_time, effective_start_date? | `service_schedule_versions` (UNCHANGED — these effective_* columns survive) |
| `upsert_metric` | metric_code, name, ministry_tag_code, reporting_tag_code, scope, is_canonical | `metrics` (resolves ministry_tag_code + reporting_tag_code → ids). **`metrics.code` exists (migration 0026, UNIQUE per church) — write `metric_code` into it and UPSERT on `(church_id, code)` for idempotency.** REPLACES upsert_volunteer_category + upsert_response_category + upsert_giving_source |
| `done` | summary | terminate |

### Phase 2 — deterministic row extraction (the rewrite target in stageB.ts)
For each source row, for each `column_map` entry with `dest_field = metric.<CODE>`:
1. Resolve `metric_id` from `<CODE>` (build a code→metric map up front, like the old code→id maps).
2. Read the metric's `scope`:
   - `instance` → resolve/upsert the `service_instance` (church_id, location_id, service_template_id, service_date), write `service_instance_id`.
   - `period` → compute `period_anchor` = Sunday-on-or-before the row date; `service_instance_id = NULL`.
3. Parse the value (money/count parser; reject negatives; blank → skip, NOT zero — Rule 2).
4. UPSERT `metric_entries (church_id, metric_id, service_instance_id|period_anchor, value, is_not_applicable)`.
   - Conflict target: `(metric_id, service_instance_id)` for instance scope, `(metric_id, period_anchor)` for period scope (the two partial unique indexes).
   - Do NOT set `reporting_tag_code` — the BEFORE-INSERT trigger denormalizes it (Rule 5).
5. Accumulate period values across rows that map to the same `(metric, period_anchor)` (sum), mirroring the old `pgMap`/`psMap` accumulation.

Occurrence table is `service_instances` (the `occurrences`/`instance_tags` tables are
GONE — do not write them). Tag stamping onto instances is no longer needed: a metric
already carries its ministry_tag, so the dashboard/views derive ministry membership
through `metrics`, not through per-instance tag rows.

---

## Clarification + patch model (validator #57 / walkthrough #58)

Keep the existing `ClarificationProposal` shape (`id, question, visual_tree?,
blocking, options?, patch_op?`) and the deduper. New/changed validator checks:
- `tag_role_unset_or_suspect` — a ministry_tag whose role looks wrong (e.g., a tag named "Kids" classified ADULT_SERVICE). Walkthrough confirms with a visual tree.
- `multiple_canonical` — two canonical metrics for one (ministry, reporting). Block.
- `metric_unmapped_column` / `column_no_metric` — a data column with no `metric.<CODE>`, or a metric with no feeding column.
- `unknown_reporting_tag` — a metric referencing a reporting_tag that is neither system nor declared.

New PatchOp kinds (add to the discriminated union; keep the rest):
- `set_ministry_tag_role { ministry_code }` (option value = the chosen tag_role)
- `set_metric_canonical { metric_code }` (toggles is_canonical, clears the sibling)
- `set_metric_scope { metric_code }` (instance ↔ period)
- `set_metric_reporting_tag { metric_code }` (re-point dimension)
Retire v1 kinds tied to dropped concepts: `set_audience_for_field`,
`reassign_categories_tag`, `set_category_primary_tag`, `toggle_category_active`,
`set_giving_routing_mode` → fold their intent into the metric-centric ops above.

**PatchOp mutation semantics (IDENTICAL client-side walkthrough and server-side reconcile_answers — do not let them diverge):**
- `set_ministry_tag_role {ministry_code}` + answer value `<ROLE>` → set `proposed_setup.ministry_tags[code==ministry_code].tag_role = <ROLE>`.
- `set_metric_canonical {metric_code}` → set that metric `is_canonical=true` AND set every other metric sharing the same `(ministry_tag, reporting_tag)` to `is_canonical=false` (preserve the ≤1-canonical invariant).
- `set_metric_scope {metric_code}` + answer value `instance|period` → set that metric's `scope`.
- `set_metric_reporting_tag {metric_code}` + answer value `<CODE>` → set that metric's `reporting_tag = <CODE>`.
- `set_template_display_name {service_code}` + value → set the template's `display_name`.
- `set_template_start_time {service_code}` + value → set the template's `start_time`.
- `record_answer_only` → no mutation (advisory context only).
Both appliers mutate the SAME `proposed_setup` shape. If a metric_code/ministry_code/service_code is not found, the op is a no-op (log, don't throw).

---

## Grid config contract (#56 derive_grid_config)

`deriveGridConfigFromSchema` now reads `service_templates`, `service_tags`
(code/name/tag_role/parent_tag_id), `reporting_tags`, `metrics`, and the views —
NOT the dropped category/entry tables. Column leaf IDs use the new grammar:
`metric.<METRIC_CODE>`. Audience grouping (the 3 buckets) derives from ministry
`tag_role` (ADULT_SERVICE→adults, KIDS_MINISTRY→kids, YOUTH_MINISTRY→youth,
OTHER→a misc/Stats group) instead of root-tag order. The output `GridConfig` shape
(`grid-config-schema.ts`) stays compatible; only the source query and the column-ID
construction change. Bump `version` to `'3.0-metrics'`.

---

## What stays the same (do not rewrite)
- Date/template/audience column DETECTION in the Pattern Reader (it's descriptive).
- Confidence-by-weeks logic, `preview_data`, `quick_summary`, `anomalies`.
- The walkthrough UX (one question at a time, halfway checkpoint, local patches, dedupe).
- The money/count parsers, date parser, slugger.
- `service_schedule_versions` and its `effective_*` columns.

---

## Implementation chunks (each references this file)
1. **Stage A** — new `propose_mapping` schema + `STAGE_A_SYSTEM` rules → emit metric-centric IR. (the producer)
2. **Stage B** — new `WRITER_TOOLS`/handlers (`upsert_ministry_tag`, `upsert_metric`, `upsert_reporting_tag`) + Phase-2 extraction to `metric_entries`. (#55)
3. **Validator** — new checks (tag_role, canonical, unknown reporting tag) + routing for `metric.<CODE>`. (#57)
4. **reconcile_answers + chat patch ops** — new PatchOp kinds. (#58 logic half)
5. **derive_grid_config** — read metrics/views, bucket by tag_role, `version 3.0-metrics`. (#56)
6. **Pattern Reader** — light: have `observed_metrics` suggest (ministry, reporting) classification hints. (optional polish)
