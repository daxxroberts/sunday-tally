# AI Onboarding Standard — V1 (Proposed)
**Status:** Proposal. Not yet implemented in code.
**Date:** 2026-04-29
**Companion document:** `AI_ONBOARDING_STANDARD_V0.md` (the as-is)
**Diff lens:** This document describes only what V1 changes from V0. Everything not mentioned stays the same.

---

## Section 0 — Sealed Protocols

These rules are permanent. Adopted from the BOT team SKILL.md (rules 1, 26, 27, 28, 29, 30 + the KEEPER read-in/write-out protocol) plus AI-pipeline-specific protocols. No prompt change, no server guard, no schema migration in this pipeline overrides them. They apply before any of the Δ1–Δ7 changes below.

**SP-1 — Nothing in the AI Onboarding Standard changes without SAGE gating.**
Every prompt rule edit, every new server guard, every schema migration touching the pipeline goes through SAGE before merge. SAGE's gate is the same one defined in the BOT SKILL.md (Sealed Protocol 1 — "Nothing ships without SAGE"). No exceptions, no override paths.

**SP-2 — AXIOM audits every new rule before adoption.**
Adopted from BOT Rule 26. Every rule added to V1+ must (a) cite the evidence that motivated it (test result, production failure, business rule), (b) name the assumptions it depends on, (c) name the source-of-truth for those assumptions. Rules without traceable evidence are rejected. AXIOM's audit is documented in the changelog entry for that version.

**SP-3 — KEEPER tracks Standard-to-code dependencies.**
Adopted from BOT KEEPER read-in/write-out protocol. Every Standard rule that references a schema column, prompt constant, server guard, or migration is recorded in a dependency map. When that downstream artifact changes, KEEPER flags the Standard entries that depend on it as Pending Update. No code changes ship if the Standard is marked Pending Update on a referenced artifact.

**SP-4 — Standard versioning is semver. Every version has a changelog.**
- **Major (X.0):** breaks the AI behavior contract — new dest_field grammar, removed rule, changed schema mapping
- **Minor (1.X):** adds rules, adds new server guards, extends grammar
- **Patch (1.1.X):** clarifies wording, adds examples, fixes documentation
Each version's changelog entry cites: rules added/removed/changed, AXIOM audit results, what evidence motivated the change, what code surfaces were updated, who signed off (SAGE).

**SP-5 — Quarterly Standard review.**
Cadence: every 90 days OR after every 25 new church onboardings, whichever comes first. AXIOM and KEEPER jointly review the `import_diagnostics` signal stream (see V1-Δ4). Output: a recommended Standard version bump. Rules with high drift counts or low question-yield are candidates for refinement or retirement. Rules with novel patterns from production data are candidates for addition. Adopted from BOT Rule 28 (vault maintenance protocol) applied to the AI Standard.

**SP-6 — AI judgment is permitted only on explicitly enumerated decisions.**
Every decision the AI is allowed to make autonomously is listed in §3 of the Standard (the framework + mapping rules). Anything not on that list is either deterministic (server-side code) or a clarification question (user input). When a new judgment surface is needed, it requires SP-1 (SAGE gate) + SP-2 (AXIOM audit) before being added to §3.

**SP-7 — No silent data routing.**
Every routing decision either (a) follows a Standard rule with deterministic enforcement, or (b) surfaces a clarification question. "Default to the closest table" is never legal. If the AI proposes a routing the schema can't honor, the import either coerces to a defined fallback (with telemetry) or fails loudly with a user-visible explanation. Silent miscategorization is treated as a Standard violation, not a graceful degradation.

**SP-8 — Every server guard fires telemetry.**
No silent fixes. Every coercion, every synthesizer fire, every fallback path, every quality-bar rejection emits a row to `import_diagnostics`. The Standard treats observability as a first-class invariant of every guard. A guard without telemetry is rejected by AXIOM audit (SP-2).

**SP-9 — One re-prompt maximum on AI calls.**
When server-side validation rejects an AI output (V1-Δ6), at most one re-prompt is allowed. If the second attempt also fails, the pipeline falls back to deterministic defaults or surfaces the issue as a clarification question. This bounds cost (max 2× tokens for any stage) and latency (max +60s).

**SP-10 — TR-01 applied to Standard changes.**
Adopted from BOT Rule 29 (graph-first on decision impact). Before changing any Standard rule, the editor reads the dependency map (SP-3) and identifies what other rules, prompt sections, server guards, or schema columns reference the rule being changed. The change PR cites this graph traversal explicitly. Cross-rule changes that affect the schema are gated by ATLAS architecture review in addition to SAGE.

**SP-11 — The Standard is portable across churches, not specialized to one.**
Adopted from BOT Rule 27 (portable product standard). No rule in the Standard may be motivated solely by Demo Church (or any single church's) data patterns. Rules require evidence from at least two distinct church shapes OR an explicit business-rule justification (e.g., "tags must be earned" is universal church-management policy, not Demo Church specialization).

**SP-12 — Implementation discipline: code references the Standard, not the reverse.**
The prose currently inside `STAGE_A_SYSTEM` and `STAGE_B_SYSTEM` constants becomes generated-from or audited-against this document, not the other way around. The mechanism is implementation choice (build-time generation, runtime parse, or audit-only reconciliation). What's required: there must be no rule in code that doesn't appear in the Standard, and no rule in the Standard that isn't honored by code.

---

## What V1 keeps from V0 (unchanged)

V1 inherits the entire V0 pipeline. No model swaps, no architectural reshape:

- Pattern Reader (Opus) → Decision Maker / Stage A (Sonnet 4.6) → Server guards → Humanizer (Haiku) → Stage B writer (Haiku) → Deterministic row extraction
- Tool-use mode for Stage A's `propose_mapping`
- Custom tag creation (SPANISH, KIDS, WEEKEND, etc.)
- Sunday-anchored period_giving (D-056)
- Pure-period source bypass
- Migration 0014's nullable service_tag_id with partial unique indexes
- All existing writer tools and their schemas
- All existing schema constraints and tables
- The 9 framework rules and 9 mapping rules from V0's Stage A prompt

V1 changes seven specific surfaces. Every other surface is identical to V0.

---

## V1 Changes — Seven Specific Deltas from V0

### V1-Δ1. The Standard moves from prose-in-code to a versioned external document.

**V0 state:** Rules live as prose in `STAGE_A_SYSTEM`, `STAGE_B_SYSTEM`, `HAIKU_HUMANIZER_SYSTEM` constants inside `.ts` files. Server guards live as inline TypeScript. Schema constraints in SQL migration files. Decision rationale partial in `DECISION_REGISTER.md`. No single document captures the contract. (V0 §10, V0-C1)

**V1 state:** `AI_ONBOARDING_STANDARD_V1.md` (this file's accepted version) becomes the source of truth. The code references the Standard, not the reverse. Prompt constants are auto-generated from the Standard at build time, OR the Standard is re-derived from the prompt at audit time — exact mechanism is implementation choice; what matters is **a single human-readable contract that doesn't drift from code without an audit trail**.

**V1 enforcement mechanism:**
- Every change to `STAGE_A_SYSTEM` / `STAGE_B_SYSTEM` / writer tool schemas / server guards requires a Standard changelog entry.
- KEEPER (vault registry pattern from BOT team protocol) tracks which rule lives where. AXIOM audits new rules before SAGE gates ship.
- Semver: major (breaks AI behavior contract — e.g., new dest_field grammar), minor (adds rules), patch (clarifies).

**Citation:** SAGE's Condition 3 from prior pressure-test session.

---

### V1-Δ2. Bidirectional stat_scope ↔ dest_field enforcement (server-side coercion).

**V0 state:** Stage A Rule 1d says "if dest_field starts with `period_response.` the category MUST have stat_scope='week'|'month'|'day'". This is a prose rule. No server-side check enforces consistency in the other direction (if `stat_scope='week'`, dest_field MUST be `period_response.*`, not `response.*`).

**V0 evidence of failure (LifeKids regression, V2 e2e):**
- Stage A produced category `LifeKids Rooms Open` with `stat_scope='week'` AND dest_field `response.LIFEKIDS_ROOMS_OPEN` (per-occurrence)
- Stage B's deterministic extractor wrote 2,337 rows to `response_entries` (per-occurrence) instead of `church_period_entries` (per-week)
- 0 rows landed in `church_period_entries`
- No errors raised — the data was misclassified silently

**V1 state:** Server-side coercion in Stage B's extraction loop. Before writing any `response.<CODE>` row, look up the category's `stat_scope`. If scope is week / month / day, force the dest_field to `period_response.<CODE>` and re-route. Emit one informational note per (category, original-dest, coerced-dest) combination so the user knows.

Inverse: before writing any `period_response.<CODE>` row, verify category's `stat_scope` is week/month/day. If scope is audience or service, error with a specific message (this is a structural mismatch, not a routing question).

**V1 enforcement:** Deterministic. Independent of AI behavior. Survives Sonnet drift.

---

### V1-Δ3. Volunteer audience rule promoted from memory to prompt + server guard.

**V0 state:** "Volunteer's `audience_group_code` is the audience served, not the age of the volunteer" lives in:
- A memory file (`feedback_volunteer_audience_for_youth.md`)
- An implicit reading of Demo Church's freeText description
- Not in the Stage A prompt as an explicit rule
- Not in any server guard

**V0 evidence of failure (Switch volunteers, two occurrences in this session):**
- First: user's opening message in this session flagged Switch volunteers being categorized as MAIN
- Second: V1 e2e import (Demo Church) — Stage A initially produced Switch volunteers with audience_type=MAIN; only on the second run (with explicit freeText hint) did it produce YOUTH

**V1 state:** Three layers of enforcement:

1. **Prompt rule (new in Stage A):**
   > **MAPPING RULE 10 — VOLUNTEER AUDIENCE = AUDIENCE SERVED.** A volunteer_category's `audience_group_code` represents the audience served by that volunteer's role, not the age or demographic of the volunteer themselves. An adult who runs the kids ministry is a KIDS-audience volunteer; an adult who leads the youth ministry is a YOUTH-audience volunteer. When uncertain, ask a blocking clarification question — never default to MAIN to be safe.

2. **Heuristic flag in Pattern Reader:** When a volunteer-type column header contains youth/kids/student/teen keywords AND the source data also contains a service template that's youth-tagged, surface this as a `volunteer_audience_hint` in the PatternReport so Stage A has explicit signal.

3. **Server guard:** After Stage A returns, scan proposed_setup. For every service_template with primary_tag in {YOUTH, KIDS} AND for every volunteer_category whose name contains a token also appearing in that template's display_name (e.g., "Switch Small Group Leaders" contains "Switch"), if that volunteer's audience_type is MAIN, synthesize a blocking question `q_volunteer_audience_<category_code>` asking the user to confirm.

**V1 enforcement:** Prompt rule for AI compliance; heuristic flag for AI signal; server guard for drift catch.

---

### V1-Δ4. `import_diagnostics` table — telemetry for the learning loop.

**V0 state:** No telemetry. 24 onboarding test runs in this session produced no captured signal beyond the test result JSON files generated explicitly for the session.

**V0 evidence of failure:** V0-C4 (no learning loop) plus V0-C10 (production imports don't feed back into the prompt).

**V1 state:** New migration adds `import_diagnostics` table. Schema:

```sql
CREATE TABLE import_diagnostics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id    UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  church_id        UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,  -- 'guard_fired' | 'invariant_drift' | 'user_override' | 'post_import_edit'
  event_data       JSONB NOT NULL,  -- structured per event_type
  observed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Event types captured:**

| Event type | When emitted | Data payload |
|---|---|---|
| `guard_fired` | A server guard injected a question or coerced output | guard_name, what was synthesized/coerced, why |
| `invariant_drift` | An AI output violated a Standard rule | rule_id, AI's output, Standard's expectation |
| `user_override` | User changed a value in the confirm UI before submitting | field_path, original_value, new_value |
| `post_import_edit` | User edited an entity in T_HISTORY / T_WEEKLY / settings within 30 days of import | table, column, original_value, new_value |

**V1 query patterns** (to feed Standard updates):
- Top 10 invariant_drifts of the last 30 days → "Sonnet is drifting on rule X most often"
- User overrides per category type → "AI is misclassifying volunteer audience 35% of the time"
- Post-import edits clustering → "Users are correcting weekly giving routing in the first 7 days"

**V1 review cadence:** Quarterly or after every 25 new church onboardings. Diagnostics queries feed AXIOM's audit of which rules need hardening, which questions are working, which are over-asking.

---

### V1-Δ5. Cadence detection in Pattern Reader.

**V0 state:** Pattern Reader extracts `date_range.min` and `date_range.max` per source. Stage A guesses cadence from column-header keywords ("Weekly Total" → week) or defaults to weekly when unclear. (V0 §2 gaps section.)

**V0 evidence of failure:** Implicit — no test showed a clear failure because none of the synthetic shapes had biweekly/quarterly/annual cadences. But V0-C3 names the gap; biweekly data would be silently misclassified as weekly with gaps.

**V1 state:** Pattern Reader computes per-metric cadence:

```typescript
// Pseudocode added to stageA_pattern.ts
function inferCadence(dates: string[]): {
  cadence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'irregular',
  median_gap_days: number,
  confidence: 'high' | 'medium' | 'low',
} {
  // Sort dates, compute gaps, median, classify by gap range:
  //   1 day → daily
  //   6-8 days → weekly
  //   13-15 days → biweekly
  //   28-32 days → monthly
  //   88-95 days → quarterly
  //   360-370 days → annual
  //   else → irregular (surface as anomaly)
}
```

**V1 PatternReport additions:**
- `metrics[].cadence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'irregular'`
- `metrics[].cadence_confidence: 'high' | 'medium' | 'low'`
- `metrics[].cadence_evidence: { median_gap_days, observed_dates_count, gap_variance }`

**V1 storage handling:**
- Cadences supported by current schema (week / month / day): write directly
- Cadences NOT supported (biweekly / quarterly / annual): Stage A produces a blocking clarification question — "Your data appears biweekly. Until biweekly support is added, would you like to: store as weekly with empty alternating weeks / store as monthly with double-counting risk / wait until biweekly is supported (no import for now)?"

**V1 enforcement:** Cadence is detected, never silently defaulted in ways that lose data. Schema extension to support biweekly/quarterly/annual is **deferred** until customer demand justifies it; until then, the question surface handles the gap.

---

### V1-Δ6. Quality bar on AI clarification questions (server-side validator).

**V0 state:** `clarification_questions` schema validates field presence (`id`, `blocking`, `type`, etc.) but not content quality. Stage A can return a blocking text question with no `data_examples`, or a choice question with 1 option, or a question that references a column that doesn't exist in the source. (V0-C8.)

**V1 state:** Server-side question validator runs before the Humanizer pass. Rejects malformed questions with specific reasons. Rejected questions either:
- Trigger a single re-prompt to Stage A with the rejection reason ("Question q_baptism_audience has only 1 data_example; rule 8 requires 2+. Rewrite.") — bounded to 1 retry
- OR get auto-completed with safe defaults (data_examples drawn from PatternReport's sample_rows)

**V1 validation rules:**

| Rule | Check | Action on failure |
|---|---|---|
| Q-1 | `blocking=true` ⇒ no `recommended_answer` | Strip recommended_answer |
| Q-2 | `blocking=true text` ⇒ ≥2 data_examples | Auto-fill from PatternReport, or re-prompt |
| Q-3 | `type='choice'` ⇒ 2-4 options | Re-prompt |
| Q-4 | `type='choice'` ⇒ last option label is "Something else" or "Other" | Auto-append |
| Q-5 | `type='policy_collapse'` ⇒ `collapse_target_ids` populated | Re-prompt |
| Q-6 | Question references column names: those names exist in source | Reject question (drop) |
| Q-7 | Question id matches synthesizer prefix (`q_service_times`, `q_service_names`, `q_volunteer_audience_*`) but content differs | Replace with synthesizer output |

**V1 enforcement:** Deterministic. Bounded re-prompts (1 max) keep token cost capped.

---

### V1-Δ7. Pattern Reader emits explicit `value_type` per column.

**V0 state:** Pattern Reader infers value_type partially via column-header keywords ("Offering" → currency, "Attendance" → integer). Many columns end up unclassified or misclassified.

**V1 state:** Pattern Reader analyzes sample row values per column and classifies:

| value_type | Detection | Routes to |
|---|---|---|
| `integer` | All sampled values parse as positive ints | attendance / volunteer / response columns |
| `decimal` | Values have decimal points but no currency markers | rare — likely response with rate-like value |
| `currency` | Values match $XXX.XX or contain ',' for thousands separators | giving / period_giving |
| `text` | Mixed strings, not numeric | metadata / labels (audience, service_type, etc.) |
| `date` | Parses as date | service_date / period_date |

**V1 storage targeting:** Stage A uses value_type to route to integer-column tables (`attendance_entries`) vs decimal-column tables (`giving_entries`) deterministically. Rule 1's mapping grammar tightens — value_type must match the dest_field's storage type.

**V1 enforcement:** Pattern Reader (deterministic numeric analysis, not AI judgment), then Stage A constraint, then writer tool schema rejection if mismatched.

---

## V1 — What's NOT Changing

To be explicit about boundaries:

- **Schema enum NOT extended in V1.** Biweekly / quarterly / annual cadences are detected and surfaced as questions but not stored. Schema extension is V2 work, contingent on diagnostics signal.
- **Path 2 unification (giving symmetric with stats) NOT in V1.** Separate decision tracked in BOT team's prior pressure-test. V1 is forward-compatible — when Path 2 ships, the cadence detection and value_type classification remain valid.
- **Path 3 full unification NOT in V1.** Not on the roadmap.
- **Sonnet-only pipeline comparison NOT included in V1.** That's a model-swap experiment, not a Standard change. Run separately.
- **No model upgrades.** V1 stays on the same models V0 uses.
- **No new query patterns.** The dashboard queries that read `church_period_entries` etc. work the same way. Telemetry queries are new but separate.

---

## V1 Pros

### V1-P1. LifeKids-class regressions become impossible.
**Citation:** V1-Δ2. Server-side coercion of stat_scope ↔ dest_field is deterministic.
**Evidence:** V0 e2e import had 0 rows in `church_period_entries` because Stage A's `stat_scope='week'` + dest_field `response.*` mismatch was silently honored. V1 catches and coerces.

### V1-P2. Switch-volunteer-class drift becomes impossible.
**Citation:** V1-Δ3 (three-layer enforcement).
**Evidence:** V0 Demo Church had this bug twice in this session. V1's prompt rule + Pattern Reader hint + server guard means it must be both AI-violated AND server-missed to escape.

### V1-P3. Standard externalization stops developer drift.
**Citation:** V1-Δ1.
**Evidence (predicted, not measured):** ATLAS's pressure-test of V0's facade pattern — drift over 6-12 months as new code adds direct-table access. V1's documentation discipline catches drift before it lands in code.

### V1-P4. Telemetry creates a learning loop.
**Citation:** V1-Δ4.
**Evidence:** V0-C10 — 24 test runs produced no signal. V1 captures every guard fire, every drift, every override, every edit. Each new church onboarding becomes signal for the next quarter's Standard update.

### V1-P5. Cadence detection unblocks data shapes V0 can't classify.
**Citation:** V1-Δ5.
**Evidence:** V0 would silently miscategorize biweekly data as weekly-with-gaps. V1 detects, surfaces, and blocks until the user resolves. No silent data loss.

### V1-P6. Question quality bar reduces user friction.
**Citation:** V1-Δ6.
**Evidence:** V1 baseline 12-shape suite — question count varied 3 to 5 per shape with no quality control. V1 rejects malformed questions; auto-fills missing data_examples; ensures every blocking question is actionable.

### V1-P7. value_type classification routes data to the right schema.
**Citation:** V1-Δ7.
**Evidence:** V0 has implicit type classification via column header keywords. A church with non-standard column names (e.g., "Plate Total" instead of "Offering") may misclassify. V1's value-based detection is more robust.

### V1-P8. AXIOM-audited assumption log.
**Citation:** V1-Δ1 enforcement mechanism.
**Evidence:** V0-C9 — implicit assumptions live in memory only. V1 has every rule citing its evidence; AXIOM audits new rules before SAGE gates them.

---

## V1 Cons (revised under §0 Sealed Protocols)

The Sealed Protocols meaningfully reduce or eliminate several cons that existed in the prior draft. Below: each con, what changed, and the residual risk if any.

### V1-C1. More moving parts. More failure modes.
**Status: REDUCED.** V1 adds 6 new pieces (bidirectional coercion, volunteer-audience guard, question validator, cadence detector, value_type classifier, telemetry instrumentation) on top of V0's 7 server guards.
**What §0 changes:** SP-2 (AXIOM audit before adoption) means each new piece arrives with documented evidence + tests. SP-8 (every guard fires telemetry) means each piece is observable in production from day one. New surface area is real, but it's instrumented surface, not opaque surface.
**Residual risk:** Bug count grows roughly linearly with code size. Mitigation: SP-5 (quarterly review) catches systemic problems via diagnostics aggregation.

### V1-C2. Telemetry table adds DB write load.
**Status: UNCHANGED.** Architectural reality. Every guard fire writes a row. 20-50 diagnostic rows per import is the rough estimate.
**Mitigation:** Async-write-only on the import path (no blocking). Retention policy added to SP-5 (quarterly review checks DB size, ages out old rows after 90 days unless flagged for case studies).

### V1-C3. Server-side question re-prompts add latency.
**Status: BOUNDED.** SP-9 caps re-prompts at 1. Worst case: +30-60s on imports where AI output fails quality validation.
**Mitigation:** SP-9 is the explicit bound. Most cases auto-fill (no re-prompt). Only triggered when ≥1 quality rule fails, which the diagnostics will tell us how often happens.

### V1-C4. Schema enum extension deferred — biweekly/quarterly/annual data has no home in V1.
**Status: REFRAMED.** SP-7 (no silent data routing) makes this an honest behavior, not a bug. Detected-but-unsupported cadences surface as clarification questions ("Your data appears biweekly. Supported options: store as weekly with empty alternating weeks / store as monthly with double-counting risk / wait for biweekly support"). V0 would silently misclassify the same data.
**Residual risk:** Users with unsupported cadences hit friction. SP-5 quarterly review tracks frequency; if biweekly demand emerges from real customers, schema enum extension is queued for the next minor version.

### V1-C5. Standard documentation discipline depends on team enforcement.
**Status: DROPPED.** This con assumed discipline was a team-effort dependency. SP-1 (SAGE gates every change), SP-3 (KEEPER tracks dependencies), SP-4 (versioned changelog), and SP-12 (code-references-Standard, not reverse) institutionalize the discipline. The Standard's freshness is an enforced invariant, not a hopeful behavior.
**What was wrong with the prior draft:** I treated discipline as something the team has to apply. In reality the BOT SKILL.md already encodes that discipline as sealed rules; importing them removes the dependency.

### V1-C6. value_type classification can over-fire on small samples.
**Status: UNCHANGED.** Pattern Reader samples ~25 rows; a column whose first 25 values are integers may have decimals later.
**Mitigation:** SP-7 + SP-8 handle this. Stage B's NUMERIC/INTEGER column constraints catch type mismatches at write time and emit a telemetry row. SP-5 quarterly review catches systemic over-fire patterns. value_type is a routing hint, not a truth claim — the schema is the actual gatekeeper.

### V1-C7. Volunteer audience rule may over-ask.
**Status: BOUNDED.** V1-Δ3's server guard fires when a YOUTH/KIDS-tagged template has MAIN-audience volunteers in its name-cluster. A multi-role volunteer (e.g., adult who runs sound for both Sunday and Wednesday) gets one extra blocking question.
**What §0 changes:** SP-5 quarterly review tracks question fatigue from telemetry. If `q_volunteer_audience_*` consistently resolves to "MAIN is correct" (volunteer serves multiple audiences), the rule gets refined or the question becomes non-blocking.
**Residual risk:** Low — a single extra interaction at onboarding, no data loss.

### V1-C8. Bidirectional coercion may mask real misclassifications.
**Status: REDUCED.** V1-Δ2 coerces `response.<CODE>` to `period_response.<CODE>` when category scope is week. The risk is the AI got the scope wrong, and we coerce toward the wrong target without asking.
**What §0 changes:** SP-8 (every guard fires telemetry) means every coercion is logged with the original AI proposal + the coerced output. SP-5 (quarterly review) surfaces patterns: if 30% of coercions are subsequently overridden by users in the confirm UI, that's a signal the AI's scope inference is broken and a clarification question should be added before coercion fires. Coercion stops being a silent fix.
**Residual risk:** First-quarter blind spot before telemetry has enough signal. AXIOM audit at v1.0 ship documents the assumption (scope inference from category name + value type is mostly correct) and the rule's escape hatch (override in confirm UI).

### V1-C9. Implementation cost.
**Status: UNCHANGED.** V0 ships now. V1 needs ~2 sprints of focused work.
**Build order with §0:**
1. Standard v1.0.0 published (this document, AXIOM audit, SAGE gate) — 1 day
2. SP-1 + SP-3 + SP-4 wired into the change-management flow — 1 day
3. import_diagnostics migration + telemetry instrumentation — 2-3 days
4. Bidirectional coercion (Δ2) — 1 day
5. Volunteer-audience guard (Δ3) — 1 day
6. Question validator (Δ6) — 2 days
7. Cadence detection (Δ5) — 2 days
8. value_type classifier (Δ7) — 1 day
9. Standard externalization mechanism (Δ1) — 1-2 days
10. Demo Church re-import to validate + first quarterly review dry-run — 2 days

Total: ~12 working days. Front-load §0 + telemetry so subsequent work is observable from the moment it ships.

### V1-C10. No A/B testing built in.
**Status: UNCHANGED.** V1 has no mechanism to run V0 and V1 side-by-side on the same import. Out of scope.
**Note:** SP-5 (quarterly review) substitutes — V1's diagnostics over time produce evidence that's structurally similar to A/B comparisons (drift rate, override rate, post-import edit rate per rule).

---

## Pressure Test — V0 vs V1 (head-to-head across 9 dimensions)

The "best output" criterion isn't single-valued. Different stakeholders weigh different dimensions differently. The table below scores each dimension on a 1–5 scale (5 = better), with evidence-cited reasoning. Then I synthesize.

### Dimension 1: Correctness of classifications
**What it measures:** Does the AI route metrics to the right tables, with the right scope, on the first try?

| | V0 | V1 |
|---|---|---|
| Score | 3 / 5 | 5 / 5 |
| Evidence | LifeKids regression (V2 e2e): 0 rows in church_period_entries due to scope/dest mismatch. Switch volunteers: misclassified twice in this session before user override. | Bidirectional coercion catches scope/dest mismatch deterministically. Three-layer volunteer audience enforcement closes the Switch case. |
| Failure mode | Silent miscategorization. User may not notice until dashboard data is wrong. | Coercion is logged (telemetry). User has signal to verify. |

**V1 wins. Decisively.**

---

### Dimension 2: Question quality (UX of clarification surface)
**What it measures:** Are the questions Sonnet generates actionable, grounded in real data, and non-redundant?

| | V0 | V1 |
|---|---|---|
| Score | 3 / 5 | 4 / 5 |
| Evidence | V1 12-shape suite: 3-5 questions per shape, varied wildly. Some shapes asked for currency clarification (good); others over-asked offering scope when description was clear (bad). No quality bar. | V1's question validator rejects malformed; auto-fills missing data_examples; ensures blocking questions are actionable. |
| Failure mode | Sometimes over-asks, sometimes under-asks. User-experienced randomness. | Quality bar catches structural issues but doesn't catch semantic over-asking. |

**V1 wins, modestly.**

---

### Dimension 3: Robustness to AI/model drift
**What it measures:** If Anthropic ships a new Sonnet next quarter, how much does the pipeline break?

| | V0 | V1 |
|---|---|---|
| Score | 2 / 5 | 5 / 5 |
| Evidence | V0-C2: prompt drift demonstrated empirically. Confidence calibration random in V1 baseline. LifeKids regression on V2 e2e. Volunteer audience drift twice in same session. | V1's deterministic guards (coercion, volunteer-audience, question validator, cadence enum check) catch drift on all known failure modes. SP-7 (no silent routing) + SP-8 (telemetry on every guard) means new drift modes are observable on first occurrence rather than discovered weeks later. SP-5 quarterly review converts drift signal into Standard updates. |
| Failure mode | Each new model release is a re-test cycle. | New drift modes emerge but are caught by telemetry on first import they affect, then fed into next quarterly review. |

**V1 wins. Big.**

---

### Dimension 4: Customer onboarding success rate
**What it measures:** % of imports that land correctly without user post-import editing.

| | V0 | V1 |
|---|---|---|
| Score | 3 / 5 | 4 / 5 |
| Evidence | Demo Church V2 e2e: 0 errors but 1 misrouting (LifeKids → response_entries instead of church_period_entries). User would notice on dashboard or weekly view. Per-service Giving column shows empty data — UX friction. | LifeKids fix means correct routing. Volunteer audience fix means correct categorization. value_type means correct schema target. Per-service Giving column auto-hide (separate fix already shipped). |
| Failure mode | Silent miscategorization that user must notice and fix manually. | Coercion + telemetry. User edits flagged in diagnostics. |

**V1 wins. Solid margin.**

---

### Dimension 5: Learning velocity (how fast we get better)
**What it measures:** Each new church onboarding teaches the pipeline something. How fast does it iterate?

| | V0 | V1 |
|---|---|---|
| Score | 1 / 5 | 4 / 5 |
| Evidence | V0-C4: 24 test runs in this session produced no captured signal. Production imports produce no learning. | V1 telemetry captures guard fires, drifts, overrides, post-import edits. Quarterly review feeds Standard updates. |
| Failure mode | Pipeline never learns. Same bug class will resurface in different shapes. | Pipeline learns from production patterns; Standard versioning records what changed and why. |

**V1 wins. The biggest gap of all.**

---

### Dimension 6: Maintenance burden
**What it measures:** Cost to add a new metric type, fix a bug, or audit current behavior.

| | V0 | V1 |
|---|---|---|
| Score | 2 / 5 | 5 / 5 |
| Evidence | V0-C1: a developer joining today reads 6 files in 3 languages. Drift between code and rules is undetectable. | V1's §0 sealed protocols institutionalize the discipline that V0 relied on team effort for. SP-1 (SAGE gates), SP-3 (KEEPER dependency tracking), SP-4 (semver + changelog), SP-12 (code references Standard, not reverse) make the contract enforceable, not aspirational. SP-5 (quarterly review) gives the Standard a heartbeat. New developers read one document. |
| Failure mode | Time-to-onboard a new dev grows linearly with code size. | Standard maintenance happens on a defined cadence (quarterly), not ad-hoc. Documentation freshness is an enforced invariant. |

**V1 wins. Big.**

---

### Dimension 7: Cost (token spend, latency)
**What it measures:** Anthropic API spend per import, end-user-perceived latency.

| | V0 | V1 |
|---|---|---|
| Score | 4 / 5 | 3 / 5 |
| Evidence | V0 has Pattern Reader (~$0.10–0.30 per source) + Stage A (~$0.05–0.15) + Humanizer ($0.01) + Stage B Haiku ($0.05). ~$0.30 per import for typical 3-source workbook. ~60-90s wall clock. | V1 adds: cadence detection in Pattern Reader (negligible — deterministic compute, no extra Sonnet call), bidirectional coercion (negligible), question validator with optional 1 re-prompt to Stage A (+ ~$0.10 in re-prompt cases, ~+30s), telemetry writes (negligible). Worst case ~+15-20% cost. Best case (no re-prompt fired) ~+0%. |
| Failure mode | Cheap but cheap-to-be-wrong. | Slightly more expensive but bounded. |

**V0 wins, slightly. Cost is real but not decisive.**

---

### Dimension 8: Implementation cost (time to ship V1)
**What it measures:** Engineering hours to deliver.

| | V0 | V1 |
|---|---|---|
| Score | 5 / 5 | 2 / 5 |
| Evidence | V0 ships now. | V1-C9: ~2 sprints of focused work. |
| Failure mode | V0's flaws compound during the period V1 isn't shipped. | Investment delayed by other priorities. Customer onboarding hits known bugs in the meantime. |

**V0 wins. By definition — it exists.**

---

### Dimension 9: Adaptability (how well does each handle a customer pattern we haven't seen yet?)
**What it measures:** When a new church shape arrives that doesn't match any of our 12 synthetic shapes, which standard handles it gracefully?

| | V0 | V1 |
|---|---|---|
| Score | 3 / 5 | 4 / 5 |
| Evidence | V0 relies on AI judgment for novel patterns. Custom tag creation works (proven for SPANISH). Pattern Reader's keyword-based likely_type works for English-named columns; weaker for non-English. | V1 adds value_type detection (more robust than keyword matching), cadence detection (handles biweekly which V0 silently fails on), and quality bar on questions. Better armed for shapes we haven't tested. |
| Failure mode | Novel patterns expose drift. | Novel patterns expose missing rules — but those become diagnostics signal to fix in the next Standard version. |

**V1 wins. Modestly.**

---

## Pressure Test Synthesis (revised after §0 sealed protocols; Implementation dimension removed)

**Note on Implementation:** The original pressure test included an "Implementation cost" dimension. That dimension is removed because the user is building this with AI and dev cost is not a factor in the evaluation. What remains are the 8 dimensions that affect the *running* product, not the build effort to get there.

| Dimension | V0 | V1 | V1 advantage |
|---|---|---|---|
| 1. Correctness | 3 | 5 | **+2** |
| 2. Question quality | 3 | 4 | +1 |
| 3. Robustness to drift | 2 | 5 | **+3** *(was +2; SP-7 + SP-8 + SP-5 raised V1)* |
| 4. Onboarding success | 3 | 4 | +1 |
| 5. Learning velocity | 1 | 4 | **+3** |
| 6. Maintenance | 2 | 5 | **+3** *(was +1; sealed protocols institutionalized discipline)* |
| 7. Cost | 4 | 3 | **−1** |
| 9. Adaptability | 3 | 4 | +1 |
| **Total** | **21 / 40** | **34 / 40** | **+13** |

V1 wins on 7 of 8 dimensions. V0 only wins on runtime cost (Anthropic API spend per import + latency).

**What changed by removing Implementation:** the V0-wins case effectively collapses. Implementation was V0's biggest single advantage (5/5 vs V1's 2/5). With it out, V0's remaining advantage is a small Cost edge — which is the only honest reason to delay V1 adoption.

**What §0 changed earlier in the math:** Maintenance and Robustness dimensions moved to V1=5/5 because sealed protocols institutionalized discipline rather than relying on hopeful behavior.

---

## Honest Synthesis — Where V0 Actually Beats V1

**V0 ships now. V1 takes 2 sprints.**

If the choice is "V1 in 2 sprints" vs "V0 with hand-fix-as-you-go for the next 2 sprints," the trade-off depends on:
- **How many new churches will onboard during V1's build window?** If zero (still pre-launch), the trade-off is moot. If 5-10, those churches will hit V0's known bugs and require manual fixes; V1's investment pays back the same week.
- **Are paying customers depending on these onboardings?** $22/mo SaaS — every misclassified import is a churn risk.
- **Is the team's bandwidth blocked elsewhere?** If yes, V0 wins by default until V1 can be prioritized.

**V0's structural simplicity is also a real virtue.** V1 has 6+ new pieces. Each is testable in isolation but is more total surface to maintain. If the team is small, V0's smaller surface is genuinely easier to reason about.

**The strongest case for V0**: stay on V0, but ship just two of V1's seven changes — the bidirectional coercion (V1-Δ2) and the volunteer-audience guard (V1-Δ3). Both are <1 day each. This catches the two empirically demonstrated bug classes without committing to the full V1 investment. Call this "V0.5."

---

## Recommendation

| Path | When |
|---|---|
| **Stay on V0** | If no churches onboarding in next sprint AND no time to invest |
| **Ship V0.5 (V1-Δ2 + V1-Δ3 only, ~2 days)** | Default recommendation for the immediate term — blocks the two demonstrated regressions, no new architecture |
| **Ship full V1 (all 7 deltas, ~2 sprints)** | When customer onboardings start scaling AND team has capacity AND telemetry is the strategic priority |

**Pressure-test conclusion:** V1 is materially better on the dimensions that matter for a SaaS product (correctness, drift robustness, learning velocity). V0 is materially better on dimensions that matter for a pre-launch project still iterating (cost, implementation speed). The right answer depends on which phase SundayTally is in.

If I were forced to pick one without knowing your phase, **I'd recommend V0.5** — V1's two highest-value changes, deferring the rest until customer pressure or telemetry signal justifies them.

The full V1 is the right destination. V0.5 is the right next step.

---

*End of V1 + pressure test. Decision is yours.*
