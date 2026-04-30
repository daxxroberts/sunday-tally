# Stage A — V1 Baseline Snapshot
**Date:** 2026-04-27
**HEAD:** 8b7c5a364071680ef4c14fb3ec1c245803df4cb7 (working tree includes uncommitted V1 work)
**Status:** Frozen reference. Do not edit. New work goes into V2.

This file captures the V1 state of the Stage A AI prompt and surrounding pipeline so V2 changes are diffable.

---

## V1 Pipeline Summary

```
Pattern Reader (Opus)
        ↓
Decision Maker / Stage A (Sonnet 4.6)  ← STAGE_A_SYSTEM in src/lib/import/stageA.ts
        ↓
Server-side Synthesizer Guards         ← q_service_names + q_service_times
        ↓
Humanizer (Haiku)                      ← rewrites questions in church-friendly language
        ↓
Stage B Writer (Haiku)                 ← STAGE_B_SYSTEM in src/lib/import/stageB.ts
        ↓
Deterministic Row Extraction           ← per-row writes to attendance, giving, period_giving, etc.
```

## V1 Stage A — 9 Framework Rules

1. Min 12-week sample (LOW_CONFIDENCE if < 12 weeks)
2. Pattern collapse at 2 identical questions
3. No nudging language
4. Tags are first-class (every template has primary_tag + reasoning)
5. Tags must be earned (no manufactured distinctions)
6. No subtags in V1
7. Date-derivable patterns are not tags
8. Consistent question format
9. day_of_week from data; start_time NEVER in data → server-synthesized question

## V1 Stage A — 9 Mapping Rules

1. observed_metrics → area_field_map
   - Including GIVING ROUTING (giving.<CODE> vs period_giving.<CODE>)
   - Including PERIOD RESPONSE ROUTING (period_response.<CODE> + .<TAG_CODE>)
1a. Never silently ignore a metric
1b. Question for ignored church-relevant columns
1c. Three-level volunteer breakout per audience
1d. Response stat scope mandatory (audience/service/week/month/day)
2. Use observed service_codes EXACTLY
3. Opaque service codes → blocking q_service_names
4. Use audience_column.proposed_map
5. Convert open_questions to clarification_questions
6. Tall format requires tall_format object
7. NULL = "not entered", not zero
8. Blocking questions never carry recommended_answer
9. Same metric in multiple groups → blocking choice question

## V1 Server-side Guards (in stageA.ts after AI returns)

```ts
// 1. q_service_names — fires when any template has display_name='[BLOCKING]'
// 2. q_service_times — fires when any template has start_time null/missing.
//    One blocking question listing ALL unscheduled templates.
//    Skips if Stage A produced any q_time_* or q_service_times itself (idempotent).
```

## V1 Stage B Writer Tools

- upsert_location
- upsert_service_tag
- upsert_service_template
- **upsert_service_schedule_version** ← NEW in V1
- upsert_volunteer_category
- upsert_response_category (now accepts week/month/day stat_scope) ← EXPANDED in V1
- upsert_giving_source

## V1 dest_field grammar

```
service_date
service_template_code
location_code
attendance.main | attendance.kids | attendance.youth
giving.<SOURCE_CODE>           ← service-tied
period_giving.<SOURCE_CODE>    ← church-wide weekly/monthly
volunteer.<CATEGORY_CODE>
response.<CATEGORY_CODE>             ← service-scope
response.<CATEGORY_CODE>.<AUDIENCE>  ← per-occurrence audience
period_response.<CODE>               ← church-wide periodic
period_response.<CODE>.<TAG_CODE>    ← per-tag periodic
ignore
```

## V1 Schema (relevant)

- `church_period_giving` (migration 0013) — Sunday-anchored
- `church_period_entries.service_tag_id` is **nullable** (migration 0014)
  - Two partial unique indexes: tagged + untagged

## Known V1 Issues (open items for V2)

1. **Confidence calibration** — clean 24-week data marked LOW_CONFIDENCE (Rule 1 says < 12 = LOW; 12+ should be MEDIUM/HIGH but AI is overly cautious)
2. **`period_response.<CODE>.<TAG_CODE>` suffix conflation** — Stage A emits `.KIDS` for audience meaning, Stage B looks it up as service_tag, fails when no KIDS service tag exists in church (LifeKids Rooms Open bug)
3. **Question count varies wildly across shapes** (3-5 per shape) — accepted as-is; Rule 2 handles structural collapse

## V1 Empirical Behavior (5-shape test, 2026-04-27)

| Shape | Weeks | Confidence | Templates | Q count |
|---|---|---|---|---|
| minimal | 24 | LOW ⚠ | 1 | 4 |
| wide-two-services | 24 | LOW ⚠ | 2 | 3 |
| weird-audience | 16 | LOW ⚠ | 1 | 3 |
| totals-only | 16 | MEDIUM | 1 | 5 |
| monthly-only | 48 | MEDIUM | 1 | 3 |

q_service_times synthesizer fired 5/5 times.
