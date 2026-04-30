# AI Onboarding Standard — V0
**Status:** Frozen reference of what is currently shipping.
**Date:** 2026-04-28
**Codebase HEAD at write-time:** 8b7c5a364071680ef4c14fb3ec1c245803df4cb7 (working tree includes uncommitted V2 work)

---

## Purpose of this document

V0 is the **as-is** documentation of SundayTally's AI onboarding pipeline as it currently exists in code. No proposed changes. No evaluation of what should be different. The goal is a faithful inventory so any later proposal (V1, V2, …) can cite specific things V0 does well or badly.

Every claim in this document cites the file (and where possible, the line range) it describes. Test evidence is cited to specific runs in this build session.

---

## 1. Pipeline Architecture

V0 is a four-stage, three-model AI pipeline plus deterministic post-processing. The architectural spine is the **two-stage "pattern recognition then decision" loop** — Pattern Reader extracts structured signal from raw data, Decision Maker classifies it.

```
Raw source(s) (CSV / Sheets URL)
        │
        ▼
┌──────────────────────┐
│ 1. Pattern Reader    │  Opus      stageA_pattern.ts
│    (Opus reads       │            → produces PatternReport per source
│     sample rows)     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 2. Decision Maker    │  Sonnet 4.6  stageA.ts (STAGE_A_SYSTEM)
│    (Stage A — turns  │              → propose_mapping tool call
│     PatternReports   │
│     into proposal)   │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 3. Server Guards     │  (no AI)   stageA.ts post-AI
│    (synthesize       │            → mutates clarification_questions
│     mandatory Qs)    │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 4. Humanizer         │  Haiku     stageA.ts (HAIKU_HUMANIZER_SYSTEM)
│    (rewrites Q copy  │            → church-friendly question text
│     for end users)   │
└──────────┬───────────┘
           │
       ──── User answers questions in confirm UI ────
           │
           ▼
┌──────────────────────┐
│ 5. Stage B Writer    │  Haiku     stageB.ts (STAGE_B_SYSTEM)
│    (calls upsert_*   │            → entities created via writer tools
│     tools)           │            writers.ts
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 6. Stage B Extractor │  (no AI)   stageB.ts after Haiku
│    (writes rows      │            → direct DB writes per source row
│     deterministic)   │
└──────────────────────┘
```

**Citation:** `sunday-tally/src/lib/import/stageA_pattern.ts`, `stageA.ts`, `stageB.ts`, `writers.ts`. Pipeline orchestrated by `src/app/api/onboarding/import/route.ts`.

**Models used:**
- Pattern Reader: `claude-opus-*` (whatever default the project uses)
- Decision Maker: `claude-sonnet-4-6`
- Humanizer: Haiku (latest configured)
- Stage B writer: `claude-haiku-4-5-20251001`
- Stage B extractor: deterministic TypeScript (no AI)

---

## 2. Detection Layer — Pattern Reader

**Lives in:** `stageA_pattern.ts` (Opus).

**Inputs:** A `NormalizedSource` for each uploaded CSV / Sheets tab — columns, sample rows (~25), row count, raw text for free-form descriptions.

**Output (PatternReport):** A structured JSON report per source. Documented in `stageA_pattern.ts`. Fields include (not exhaustive):
- `date_range.min` / `date_range.max`
- `service_type_column` (with `distinct_values`, `is_opaque` flag)
- `audience_column` (with `proposed_map`)
- `grouping_columns`
- `observed_metrics` — each with `name`, `likely_type` (attendance / response / volunteer / giving / unknown), audience-scoped flag
- `ignored_columns`
- `open_questions` (research questions the Pattern Reader couldn't resolve)
- `anomalies` (date gaps, outlier values, etc.)
- `tall_format` hints (if structure suggests tall format)

**What V0 does in detection:**
- Reads a sample of rows (not the full sheet) for cost reasons
- Classifies columns by likely_type via header keyword matching + value pattern matching
- Identifies tall vs wide format
- Surfaces anomalies and open questions for downstream AI to handle

**What V0 does NOT do in detection** (gaps in current pipeline):
- Cadence inference (median inter-date gap, classification as daily/weekly/biweekly/etc.) — not present
- Value-type inference (integer vs decimal vs currency) — partial; only triggers on column-name keywords like "offering" or "$"
- Cross-source pattern matching (e.g., "this giving sheet's dates match this attendance sheet") — not present
- Confidence per-detection (each finding either present or absent, no soft scoring)

**Citation:** `sunday-tally/src/lib/import/stageA_pattern.ts`. Output type: `PatternReport` interface.

---

## 3. Decision Layer — Stage A

**Lives in:** `STAGE_A_SYSTEM` constant, `sunday-tally/src/lib/import/stageA.ts` lines ~11–~250 (post V2 edits).

**Inputs:** All PatternReports + optional `freeText` church description.

**Output:** A `propose_mapping` tool call with this structure (per the schema in `PROPOSE_MAPPING_TOOL`):
- `confidence` (HIGH / MEDIUM / LOW_CONFIDENCE)
- `weeks_observed`
- `low_confidence_note`
- `sources` — each with `source_name`, `dest_table`, `column_map`, `tall_format`, `default_service_template_code`
- `proposed_setup` — `locations`, `service_templates` (with `day_of_week`, `start_time`, `primary_tag`, `audience_type`), `response_categories` (with `stat_scope`), `giving_sources`, `volunteer_categories`
- `clarification_questions`
- `anomalies`
- `preview_data.monthly_attendance`
- `quick_summary`

### 3.1 The 9 Framework Rules (transcribed from current stageA.ts)

1. **CONFIDENCE THRESHOLDS BY WEEKS_OBSERVED.** Compute `weeks_observed = floor((max - min) / 7) + 1`. Strict thresholds: ≥26 → HIGH, 12–25 → MEDIUM, <12 → LOW_CONFIDENCE + low_confidence_note. Confidence is a function of weeks_observed only; data-quality concerns surface in `low_confidence_note` or clarification_questions, not as a band downgrade.
2. **PATTERN COLLAPSE AT 2 IDENTICAL QUESTIONS.** When 2+ questions share option set + decision type, keep first, replace rest with one `policy_collapse` question.
3. **NO NUDGING.** Never write "Many churches prefer…", "We recommend…", etc.
4. **TAGS ARE FIRST-CLASS.** Every service_template needs primary_tag + primary_tag_reasoning. Time-based (MORNING / EVENING / MIDWEEK / WEEKEND), audience-based (MAIN / KIDS / YOUTH), or custom. Use audience-based when service is dedicated entirely to one audience (every attendee is kids, etc.).
5. **TAGS MUST BE EARNED.** Distinct primary_tag only when (a) recurring, (b) meaningfully distinct, (c) produces a dashboard row the church wants. Identical patterns → same tag.
6. **NO SUBTAGS IN V1.**
7. **DATE-DERIVABLE PATTERNS ARE NOT TAGS.** No JANUARY / SUMMER / FIRST_SUNDAY / 2024.
8. **CONSISTENT QUESTION FORMAT.**
9. **DAY_OF_WEEK FROM DATA.** Mandatory on every template (inferred from observed dates). `start_time` always null on output — server synthesizes the question. No per-template time questions from the AI itself.

### 3.2 The 9 Mapping Rules

1. **observed_metrics → area_field_map** with full grammar:
   - Attendance routing: wide format (`attendance.main` / `.kids` / `.youth`) vs tall format (bare `attendance` with audience_map)
   - Audience response: `response.<CODE>.MAIN/KIDS/YOUTH`
   - **Giving routing:** `giving.<CODE>` (per-service, → `giving_entries`) vs `period_giving.<CODE>` (church-wide, → `church_period_giving`, Sunday-anchored)
   - **Period response routing:** `period_response.<CODE>` (church-wide periodic, → `church_period_entries` with NULL tag) vs `period_response.<CODE>.<TAG_CODE>` (only when that primary_tag exists in proposed_setup.service_templates)
1a. Never silently ignore a metric — every observed_metric in area_field_map; if uncertain, "ignore" + blocking question.
1b. Ignored columns with church-relevant names get a non-blocking question.
1c. Three-level volunteer breakout when audience-multi (separate categories per audience).
1d. **Response stat_scope mandatory** on every response_category — five values valid: audience, service, week, month, day. Bidirectional binding: dest_field ending in .MAIN/.KIDS/.YOUTH ⇔ stat_scope='audience'; dest_field starting `period_response.` ⇔ stat_scope ∈ {week, month, day}.
2. service_codes from observed `distinct_values` exactly.
3. Opaque service codes → blocking q_service_names question + display_name marked `[BLOCKING]`.
4. audience_column.proposed_map → tall_format.audience_map.
5. PatternReport open_questions → clarification_questions.
6. Tall format requires tall_format object with metric_name_column / value_column / audience_column. Compound keys when group_type_column is present.
7. NULL ≠ zero.
8. Blocking questions never carry recommended_answer.
9. Same metric in multiple groups (e.g. baptisms in both MAIN and KIDS) → blocking choice question.

**Critical rule:** Every source with a date column needs a service template (proposed_setup non-empty + default_service_template_code on every source without a template_code column). **Exception:** pure-period sources (only `period_giving.*` / `period_response.*` / `ignore`) need no template.

**Citation:** `STAGE_A_SYSTEM` constant in `stageA.ts`, ~lines 11–250 (after V2 edits).

---

## 4. Server-Side Guards

Run after Stage A returns its `propose_mapping`, before the Humanizer pass. Deterministic — no AI judgment.

### 4.1 `q_service_names` synthesizer
**Code:** `stageA.ts` after Stage A's tool-loop result, ~lines 678–710 (post V2).
**Trigger:** Any service_template has `display_name` containing `[BLOCKING]` AND no existing question with id `q_service_names`.
**Action:** Prepends a single text question listing all unnamed codes for the user to name.
**Origin:** Pre-V2 — handles opaque codes case (Demo Church's Service Type "1" / "2").

### 4.2 `q_service_times` synthesizer (V2)
**Code:** `stageA.ts` after q_service_names guard, ~lines 712–745.
**Trigger:** Any service_template has `start_time` null/missing/empty AND no existing question with id `q_service_times` or `q_time_*`.
**Action:** Pushes a single multi-row text question listing every unscheduled template with its `day_of_week` label (Sundays / Wednesdays / etc.).
**Origin:** V2 — empirical evidence that Sonnet drops Rule 9's start_time question requirement.

### 4.3 Period-response tag fallback (V2)
**Code:** `stageB.ts` during deterministic row extraction, both tall (~line 481) and wide (~line 651) format paths.
**Trigger:** A `period_response.<CODE>.<TAG>` dest_field references a service_tag that doesn't exist in the church.
**Action:** Writes the row with `service_tag_id = NULL` instead of erroring; emits one informational note per unique (catCode, tagCode) pair.
**Schema dependency:** Migration 0014 made `church_period_entries.service_tag_id` nullable + added partial unique indexes for tagged vs untagged rows.
**Origin:** V2 — observed in Demo Church V1 e2e (LifeKids Rooms Open emitted with `.KIDS` suffix when no KIDS tag existed; 120 errors, 0 rows in `church_period_entries`).

### 4.4 Period-giving Sunday snapping
**Code:** `stageB.ts` `sundayOfWeek()` helper + `addPeriodGiving()` accumulator.
**Action:** Every `period_giving.*` row's date is snapped to the Sunday on or before that date before write.
**Decision:** D-056 (DECISION_REGISTER.md).
**Origin:** Pre-V2.

### 4.5 Pure-period source bypass
**Code:** `stageB.ts` wide-format path (~lines 593–615).
**Action:** Sources whose entire column_map is `period_giving.*` / `period_response.*` / `ignore` skip the occurrence-creation requirement and write directly to `church_period_giving` / `church_period_entries`.
**Origin:** Pre-V2 (added with the period_giving migration 0013).

### 4.6 Synthetic Sunday rows in History grid
**Code:** `src/app/(app)/services/history/page.tsx` `loadData()` (added in this session).
**Action:** When `church_period_giving` has weekly amounts but no Sunday service_occurrence exists in that week, inject a synthetic Sunday row to anchor the weekly cell. Visual: amber-tinted, "weekly only" label.
**Origin:** This session (April 2026).

### 4.7 [BLOCKING] template + missing q_service_names auto-synth
**Code:** `stageA.ts` (existing pre-V2 guard).
**Action:** If Sonnet produces templates with `display_name='[BLOCKING]'` but forgets the q_service_names question, server inserts the question.
**Origin:** Pre-V2.

---

## 5. Humanizer

**Lives in:** `runHaikuHumanizer()` in `stageA.ts`, with `HAIKU_HUMANIZER_SYSTEM` prompt constant.
**Model:** Haiku.
**Action:** Receives the raw `clarification_questions` (post-server-guards) and rewrites question text in church-friendly language. Strips technical terms (service_template → service, audience_group_code → who attends, etc.). Does not change question IDs, blocking flags, types, or option counts.
**Output:** Same JSON shape, only `title` / `context` / `question` / option `label` / option `explanation` rewritten.
**Failure handling:** If the humanizer call fails, the pipeline falls back to the un-humanized questions (`.catch(() => rawQuestions)` at the end of `stageA.ts`).

---

## 6. Writer Layer — Stage B

### 6.1 Stage B AI prompt (Haiku)
**Lives in:** `STAGE_B_SYSTEM` constant in `stageB.ts`.
**Job:** Call the writer tools to create every entity the proposed_setup references. Do NOT extract row data — that's deterministic.

**Mandatory rules in the prompt:**
- Tool call order: locations + tags → templates → schedule_versions → categories + sources
- **Every `upsert_service_template` MUST be followed by `upsert_service_schedule_version`** — fallback chain: proposed_setup.start_time → qa_answers → data-date inference → default 10:00 Sunday
- service_codes must match raw values from source data
- At least one service template must exist (will create a default if proposed_setup is empty)
- Terminate with `done` tool call

### 6.2 Writer tool catalog (`writers.ts`)

| Tool | Creates row in | Required fields | Validation |
|---|---|---|---|
| `upsert_location` | `church_locations` | name, code | code uppercase-slugged |
| `upsert_service_tag` | `service_tags` | tag_code, tag_name | tag_code uppercase-slugged |
| `upsert_service_template` | `service_templates` | service_code, display_name, location_code, primary_tag_code | location + tag must exist; audience_type optional (MAIN/KIDS/YOUTH) |
| `upsert_service_schedule_version` | `service_schedule_versions` | service_code, location_code, day_of_week, start_time | day_of_week 0–6; start_time HH:MM or HH:MM:SS; effective_start_date defaults to today |
| `upsert_volunteer_category` | `volunteer_categories` | category_code, category_name, audience_group_code | audience must be MAIN/KIDS/YOUTH |
| `upsert_response_category` | `response_categories` | category_code, category_name, stat_scope | stat_scope: audience / service / week / month / day |
| `upsert_giving_source` | `giving_sources` | source_code, source_name | code uppercase-slugged |
| `done` | (none) | summary | terminator |

### 6.3 Deterministic row extraction
After writer tools complete, `stageB.ts` reads each source's raw rows and writes data per the column_map. Two format paths:

**Tall format path** (~lines 250–520): groups rows by occurrence key (date × template), then iterates row-by-row, dispatching by dest_field prefix:
- `attendance.<bucket>` → `attendance_entries` (UPSERT on service_occurrence_id)
- `giving.<CODE>` → `giving_entries` (UPSERT on (service_occurrence_id, giving_source_id))
- `period_giving.<CODE>` → `church_period_giving` accumulator (UPSERT on (church, source, period_type, period_date))
- `period_response.<CODE>[.<TAG>]` → `church_period_entries` accumulator (UPSERT, two conflict targets for tagged vs untagged via partial indexes)
- `response.<CODE>[.<AUDIENCE>]` → `response_entries` (UPSERT)
- `volunteer.<CODE>` → `volunteer_entries` (UPSERT)

**Wide format path** (~lines 535–760): one row per (date, template). Same dest_field dispatch but per-row instead of per-occurrence-group. Pre-scan determines pure-period sources to bypass occurrence creation.

Both paths use the same accumulators (`pgMap`, `psMap`, etc.) so duplicate writes within a batch are summed before flush.

**Citation:** `sunday-tally/src/lib/import/stageB.ts`, full file.

---

## 7. Schema Constraints (storage targets V0 can write to)

| Table | Scope | Value | Cadence enum | RLS |
|---|---|---|---|---|
| `service_occurrences` | per (church, location, template, date) UNIQUE | container | — | church_isolation policy |
| `attendance_entries` | per occurrence | int | — | via occurrence policy |
| `volunteer_entries` | per (occurrence, category) | int | — | via occurrence policy |
| `response_entries` | per (occurrence, category, audience\|null) | int | — | via occurrence policy |
| `church_period_entries` | per (church, tag\|null, category, period_type, period_date) | int | week / month / day | partial unique index split (0014) |
| `giving_entries` | per (occurrence, source) | NUMERIC(12,2) | — | via occurrence policy |
| `church_period_giving` | per (church, source, period_type, period_date) | NUMERIC(12,2) | week / month | RLS by membership |

**Cadences supported:** week, month, day (stats only). **NOT supported:** biweekly, quarterly, annual.
**Decimal cadences:** week, month (giving). NOT supported: day, biweekly, quarterly, annual.

**Citations:** Migrations `0001_initial_schema.sql` through `0014_period_entries_nullable_tag.sql`, `sunday-tally/supabase/migrations/`.

---

## 8. Validation Surface — what's enforced where

| Invariant | Where | Mechanism |
|---|---|---|
| Every template gets a start_time question | Server (synthesizer §4.2) | Deterministic |
| Opaque service codes get a names question | Server (synthesizer §4.1) | Deterministic |
| Confidence band matches weeks_observed | AI prompt (Rule 1) | Prose rule |
| stat_scope ↔ dest_field bidirectional binding | AI prompt (Rule 1d) | Prose rule |
| period_response.<TAG> only when tag exists | AI prompt + server fallback (§4.3) | Prompt + deterministic fallback |
| period_giving date snapped to Sunday | Server (§4.4) | Deterministic |
| Day_of_week inferable | AI prompt (Rule 9) | Prose rule |
| Volunteer audience = audience served (not age) | (none in code) | Memory-only convention |
| Schedule_version after every template | AI prompt (STAGE_B_SYSTEM) | Prose rule |

---

## 9. Observability / Telemetry

**None implemented.** No `import_diagnostics` table. No record of:
- Which server guards fired per import
- Which Stage A invariants drifted (compliant vs synthesized)
- What the user changed in the confirm UI before submitting
- What the user edited in T_HISTORY / T_WEEKLY after import

Each onboarding is a one-shot event with no captured signal.

---

## 10. Where the rules currently live

| Artifact | File | Status |
|---|---|---|
| Framework + mapping rules | `stageA.ts` `STAGE_A_SYSTEM` constant | The de facto standard, ~200 lines of prose inside a code file |
| Stage B writer rules | `stageB.ts` `STAGE_B_SYSTEM` constant | Same pattern |
| Humanizer copy guidelines | `stageA.ts` `HAIKU_HUMANIZER_SYSTEM` constant | Same pattern |
| Server guards | Inline TypeScript in `stageA.ts` post-AI-return + `stageB.ts` extractor | Implementation, not documented as a contract |
| Writer tool schemas | JSDoc on tool definitions in `writers.ts` | Implementation detail |
| Schema constraints | Migration SQL files | Source of truth, requires reading SQL |
| Decision rationale | `DECISION_REGISTER.md` D-001 through D-056 | Partial — many implicit decisions never captured |
| Memory-only conventions | `.claude/projects/.../memory/feedback_*.md` | Per-Claude-session, not in the codebase |

**No single document codifies the contract.** A new developer or AI session has to read across these artifacts to understand what V0 does.

---

# V0 Evaluation

## Pros

### V0-P1. Two-stage AI architecture is the right shape.
**Citation:** `stageA_pattern.ts` + `stageA.ts` runStageA function.
**Evidence:** Across 24 test runs in this session, Pattern Reader produced reliable structured signal that Stage A could classify against. No test surfaced a "Pattern Reader broke entirely" failure. The separation of "read the data" from "make decisions" lets each stage use a model right-sized for the task (Opus for unstructured comprehension, Sonnet for structured output).

### V0-P2. Tool-use mode constrains AI output shape.
**Citation:** `PROPOSE_MAPPING_TOOL` schema in `stageA.ts`.
**Evidence:** All 24 test runs returned valid JSON conforming to the tool schema. No malformed-output failures observed. The schema mode is more reliable than freeform JSON for constraining structure.

### V0-P3. Server-side synthesizer pattern works.
**Citations:** §4.1, §4.2.
**Evidence:** V2 12-shape suite — `q_service_times` fired in 11/12 runs and was correctly skipped in test 10 (times-in-description) where the AI extracted times from freeText. The pattern catches Rule 9 drift deterministically.

### V0-P4. Custom tag creation enables diverse churches.
**Citation:** Stage A Rule 4 (tag taxonomy includes "custom").
**Evidence:** V1 12-shape suite — multi-language test correctly created `SPANISH` tag; many-templates test created `WEEKEND` tag for Saturday Night service; kids-as-template test created `KIDS` tag for LifeKids. AI didn't need every tag pre-defined.

### V0-P5. Multi-source workbook handling.
**Citation:** Stage A loops over PatternReports, propose_mapping `sources` array.
**Evidence:** V1 mixed-giving test (test 7) correctly handled 2 separate sources in one workbook (per-service giving sheet + weekly online giving sheet) and routed each independently. Demo Church e2e handled 3 sources (Sunday Main / Switch / Weekly Giving) without confusion.

### V0-P6. Sunday-anchored period_giving (D-056) matches church mental model.
**Citation:** D-056 in DECISION_REGISTER.md, `sundayOfWeek()` in stageB.ts.
**Evidence:** User's Demo Church giving data has dates that don't all fall on Sundays; the deterministic snap places them all on Sunday-of-week. User explicitly confirmed this matches their mental model.

### V0-P7. The migration 0014 (nullable service_tag_id) plus partial-index design.
**Citation:** `0014_period_entries_nullable_tag.sql`.
**Evidence:** Tagged and untagged period entries coexist in `church_period_entries` with no UNIQUE conflict. Stage B's split UPSERT pattern (one for tagged, one for untagged) maps cleanly to the indexes.

### V0-P8. Stage B writer-tool model (Haiku for mechanical work, Sonnet not needed).
**Citation:** STAGE_B_SYSTEM model selection.
**Evidence:** Demo Church e2e — Haiku created 1 location, 2 tags, 3 templates, 3 schedule_versions, 9 volunteer categories, 4 response categories, 8 giving sources without errors. Cost is materially lower than running Sonnet for the same work.

### V0-P9. Pure-period source bypass.
**Citation:** §4.5.
**Evidence:** Demo Church Weekly Giving sheet (gid 181499763) had no service_template_code column; was correctly identified as pure-period and bypassed the occurrence-creation requirement.

### V0-P10. Confidence calibration (V2 hardening).
**Citation:** Stage A Rule 1.
**Evidence:** V1 baseline 12-shape suite had 4 random HIGHs at sub-26 weeks (calibration was inconsistent). V2 12-shape suite produced 11/12 correct calibrations under strict thresholds. Empirical improvement.

---

## Cons

### V0-C1. No single document captures the contract.
**Citation:** §10.
**Impact:** This document didn't exist before today. A developer or AI session joining the project has to read 6 files in 3 languages (TypeScript, SQL, Markdown) to understand what V0 does. Onboarding cost compounds; rule drift becomes harder to track.

### V0-C2. AI prompt drift on prose rules.
**Citation:** V1 baseline tests, especially the LifeKids Rooms Open regression in V2 e2e.
**Evidence:**
- V1 baseline: confidence calibration random across same-week-count shapes (multi-campus 24wk → HIGH; baseline rerun 24wk → LOW)
- V2 e2e (Demo Church): Stage A set `stat_scope='week'` AND used dest_field `response.LIFEKIDS_ROOMS_OPEN` (not `period_response.*`) — Rule 1d's bidirectional binding violated. 0 rows landed in `church_period_entries`. The "MUST" in the prompt didn't bind the AI.
- V2 sparse-with-gaps test: 30 weeks of data with 3 vacation gaps; Rule 1 explicitly forbids downgrading for data-quality reasons; AI returned MEDIUM anyway.

### V0-C3. Missing detection: cadence inference.
**Citation:** §2 gaps section.
**Impact:** Pattern Reader produces date_range but not cadence. Stage A guesses cadence from column header keywords; defaults to weekly when unclear. Biweekly / quarterly / annual cadences would be silently misclassified — schema doesn't even have storage for them, so detection without schema extension would just generate clarification questions.

### V0-C4. No telemetry — 24 test runs produced no captured signal.
**Citation:** §9.
**Evidence:** This session ran 5 (V1 baseline) + 12 (V1 suite) + 12 (V2 suite) = 29 onboarding test runs. Findings are stored ONLY in `STAGE_A_V1_TEST_RESULTS.json` / `STAGE_A_V2_TEST_RESULTS.json` files generated explicitly for this session. No production import logs anything beyond Stage A's tool-call result, which is opaque.

### V0-C5. Volunteer audience rule is unenforced.
**Citation:** Validation surface §8 — "memory-only convention".
**Evidence:** User flagged "Switch volunteers should be tagged YOUTH not MAIN" in this session. The rule lives in:
- A memory file (`feedback_volunteer_audience_for_youth.md`)
- Implicitly in the Demo Church re-import (Stage A happened to get it right in V2 because the freeText description named the audience)
- It does NOT live in the prompt as a rule, in a server guard, or in a schema constraint.
If Sonnet flips on this in a future run, V0 won't catch it.

### V0-C6. Schema asymmetry between giving and stats.
**Citation:** §7 storage table list.
**Evidence:** Stats use one logical pattern across two tables linked by `stat_scope`: `response_entries` for per-occurrence, `church_period_entries` for period. Giving uses two physically separate tables (`giving_entries`, `church_period_giving`) without a unifying scope field on `giving_sources`. This asymmetry produces:
- The "per-service Giving column shows on History grid even when church only tracks weekly giving" UX bug
- AI prompt complexity: separate routing rules for each
- Dashboard query duplication

### V0-C7. UI inflexibility on metric scope.
**Citation:** `src/app/(app)/services/history/page.tsx` (originally), the `displayTemplates × subColumns` rendering.
**Evidence:** History grid hardcodes "every active template gets every sub-column (Main, Kids, Youth, Giving, Vols, Stats)". A church with no per-service giving still sees a Giving column under every service — empty in every cell. The fix added in this session (auto-hide based on detected per-service data) is **not yet shipped**; current production behavior is the bug.

### V0-C8. No quality bar on AI question output.
**Citation:** Stage A clarification_questions schema accepts any JSON; only fields are validated.
**Evidence:** Question count varies wildly across shapes (2 to 5 questions, V1 12-shape suite). No invariant enforces that questions are actionable, grounded in real data, or non-redundant. Rule 2 (collapse identical questions) is a prose rule with no enforcement.

### V0-C9. Implicit assumptions live in memory only.
**Citation:** `.claude/projects/.../memory/` files.
**Evidence:** Sunday-anchor convention, audience-served-not-age rule, Switch=youth convention — all live in per-session memory files outside the codebase. They don't survive a fresh AI session unless memory loads them. They don't apply if a developer opens the code without the memory context.

### V0-C10. No mechanism to learn from production imports.
**Citation:** Direct consequence of §9 (no telemetry).
**Impact:** Even if V0 has 100 churches successfully onboarded, V0 won't get smarter from those onboardings. Patterns observed in production don't feed back into the prompt. Each new church onboarding is treated as a first onboarding.

### V0-C11. No explicit cadence field in proposed_setup.
**Citation:** §2 / §3 schema.
**Impact:** Stage A's output doesn't carry an explicit "cadence: weekly" field per metric. Cadence is implicit in the dest_field choice (`giving.X` vs `period_giving.X`) and in the response_category's stat_scope. Means cadence can't be surfaced or overridden in the confirm UI as a first-class field.

### V0-C12. Drift on Rule 1d (stat_scope ↔ dest_field binding).
**Citation:** V0-C2 evidence.
**Impact:** This is the specific bug class that produced the LifeKids regression. Stage A wrote `stat_scope='week'` on the category but `response.<CODE>` (not `period_response.<CODE>`) as dest_field. Rule 1d says they must match. Sonnet violated it. No server guard checks consistency.

---

## V0 Open Items (from this session, not addressed in V0)

These are gaps surfaced during this build session that V0 does NOT yet address:

1. The per-service Giving column auto-hide on History grid (UI fix, not shipped)
2. Bidirectional stat_scope ↔ dest_field server validation (LifeKids fix, not shipped)
3. Cadence detection in Pattern Reader (proposed, not implemented)
4. Telemetry / `import_diagnostics` (proposed, not implemented)
5. Volunteer-audience rule enforcement in prompt or guard (memory-only)
6. Schema cadence enum extension (biweekly / quarterly / annual)
7. Schema unification (Path 2: giving symmetric with stats; Path 3: full unification)
8. Sonnet-only pipeline comparison (model swap test, not run)
9. Documentation of decision provenance for every prompt rule (partial in DECISION_REGISTER.md)

---

## What's NOT in V0

To be explicit about boundaries:

- **No formal versioning.** This document is V0; the codebase has no version tag corresponding to it.
- **No enforcement that future changes update this doc.** A developer can edit `STAGE_A_SYSTEM` without updating V0.
- **No machine-readable schema for the rules.** Rules are prose inside a TypeScript constant.
- **No A/B testing framework.** Compare V0 vs proposed-V1 manually by reading test results.
- **No SLA on AI behavior.** No documented latency targets, no token budget per onboarding, no error budget.

---

## Citations summary

| Claim source | File / artifact |
|---|---|
| V0 architecture | `stageA_pattern.ts`, `stageA.ts`, `stageB.ts`, `writers.ts`, `src/app/api/onboarding/import/route.ts` |
| Schema | `sunday-tally/supabase/migrations/0001` through `0014` |
| Decisions | `DECISION_REGISTER.md` D-001 through D-056 |
| Test evidence | `STAGE_A_V1_TEST_RESULTS.json` (12 shapes), `STAGE_A_V2_TEST_RESULTS.json` (12 shapes) |
| Demo Church e2e evidence | `start-import.mjs` + `finish-import.mjs` outputs in this session |
| Memory conventions | `.claude/projects/C--Users-daxxr-OneDrive-Documents---Personal-OneDrive-Projects-WORK-Business-Files-Church-Analytics-SundayTally/memory/MEMORY.md` |

---

*End of V0 documentation. V1 (proposed standard with changes from V0) lives in a separate document and is not described here.*
