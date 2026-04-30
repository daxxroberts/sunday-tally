# AI Onboarding Standard — V1.5 (Proposed)
**Status:** Proposal. Not yet implemented.
**Date:** 2026-04-29
**Companion documents:** `AI_ONBOARDING_STANDARD_V0.md` (as-is) and `AI_ONBOARDING_STANDARD_V1.md` (V1 proposal with sealed protocols).
**Diff lens:** This document describes only what V1.5 changes from V1. Everything not mentioned is inherited.

---

## What V1.5 keeps from V1 (unchanged)

V1.5 inherits everything from V1:
- All 12 Sealed Protocols (§0 of V1)
- All 7 V1 deltas (Δ1 externalized Standard, Δ2 stat_scope coercion, Δ3 volunteer-audience guard, Δ4 telemetry, Δ5 cadence detection, Δ6 question quality bar, Δ7 value_type)
- The pipeline architecture (Pattern Reader Opus → Stage A Sonnet → guards → Humanizer → Stage B)
- Tool-use mode for `propose_mapping`
- Custom tag creation
- Sunday-anchored period_giving (D-056)
- Migration 0014 nullable service_tag_id
- All schema constraints

V1.5 changes six specific surfaces. Everything else stays as V1.

---

## V1.5 Changes — Six Specific Deltas from V1

### V1.5-Δ1. Pattern Confirmation Phase (new phase between Pattern Reader and Stage A)

**V1 state:** Pattern Reader produces a PatternReport, Stage A immediately uses it for classification. The user sees questions only AFTER Stage A has made all routing decisions. If Pattern Reader misread something, the AI's classification compounds the misread.

**V1.5 state:** A new deterministic phase runs between Pattern Reader and Stage A. This phase generates 3–7 server-templated questions about what was detected — not about routing decisions. Output: a `ConfirmedPatternReport` reflecting the user's actual data structure, not just the AI's reading.

**Phase flow:**
```
Pattern Reader (Opus) → PatternReport
    │
    ▼
Pattern Confirmation (NEW)
  • Question library generates 3–7 questions deterministically
  • User answers, with adaptive branching (V1.5-Δ3)
  • Output: ConfirmedPatternReport
    │
    ▼
Stage A (Sonnet) — runs against confirmed report
```

**Scope:** The phase only fires for facts the user can verify by looking at their own data. Not "how should this be routed" (that's Stage A's job) — only "is this what we're seeing?"

**Question library is deterministic.** No AI call to generate the questions themselves. AI inference is only for the structural question (V1.5-Δ2) where data alone can't disambiguate.

**Citation:** This session — pattern verification gap identified in V0 evaluation; user explicit framing "ask about the pattern before asking about routing."

---

### V1.5-Δ2. Three-meaning structural audience question

**V1 state:** Stage A classifies audience based on detection heuristics + freeText description. Two structural meanings exist (age-group breakdown vs independent services), and the AI guesses which applies. Volunteer-audience rule (V1-Δ3) addresses one specific case but not the broader structural choice.

**V1.5 state:** Pattern confirmation phase explicitly disambiguates among **three** structural meanings of "audience":

| Meaning | Description | Schema mapping |
|---|---|---|
| **(M1) Age-group breakdown** | One shared gathering, attendance counted by age group. "Sunday service: 200 adults, 50 kids, 30 students — all in the same room or counted by section." | One service_template, audience-split attendance via `main_attendance / kids_attendance / youth_attendance` |
| **(M2) Independent services** | Each audience has its own service identity, possibly different times or days. "Wednesday Switch (youth) and Sunday Main (adults) are completely separate." | Multiple service_templates, each with its own day_of_week / start_time / `audience_type` |
| **(M3) Parallel experiences within a service slot** | Each Sunday service slot (e.g., 9:30, 11:00) has multiple parallel rooms running simultaneously — adults in sanctuary, kids in kid wing, students in youth room. Each is its own experience with its own attendance / volunteers / stats, but they're tied to the same parent service occurrence. | One service_template per time slot. Audience-split attendance ON the occurrence + audience-tagged volunteer_categories + audience-scoped response_categories. The schema already supports this via `audience_group_code`. |

**Why three not two:** M1 and M3 produce identical-looking data shapes (Adult / Kid / Student columns under a service date). They differ in the *intent* of the church — M1 says "we count separately, but it's one gathering"; M3 says "they're three actual gatherings happening simultaneously, each with its own program." Schema treats them the same way; UX should distinguish them so dashboard rollups, volunteer routing, and stat scoping reflect what the church means.

**The pattern question (deterministic, server-generated):**

When PatternReport detects audience-suffixed columns (Adult/Kid/Student headers, or audience-split rows in tall format), the question library emits:

> *"We see your data has an Adult/Kid/Student breakdown. Best fit for your church:*
> *— **(A)** Each Sunday service has separate Adult, Kids, and Student experiences happening simultaneously in different rooms, each with its own counts, volunteers, and stats.* *(M3)*
> *— **(B)** It's one combined gathering each Sunday; the Adult/Kid/Student columns are just headcounts broken down by age.* *(M1)*
> *— **(C)** The Adult, Kids, and Student services run on different days or completely separate schedules.* *(M2)*"

**Routing once answered:**
- M3 → audience-split attendance + audience-tagged volunteers + audience-scoped stats per occurrence (V0 schema, no changes)
- M1 → audience-split attendance only; volunteers and stats default to MAIN unless otherwise specified
- M2 → separate service_templates per audience; each routes independently

**Citation:** Three-meaning insight from this session (user-flagged: "kids might be like the service category" + "9:30 services have parallel experiences").

---

### V1.5-Δ3. Adaptive delta analyzer (branching on unexpected answers)

**V1 state:** Clarification questions are generated once and presented as a fixed list. If the user's answer to one question contradicts the AI's assumptions, the rest of the question list still reflects those assumptions.

**V1.5 state:** Pattern confirmation phase runs as a mini-loop. Each question carries:
- The AI's **expected answer** (from PatternReport)
- A list of **dependent questions / routing decisions** that hinge on the answer

When the user answers, a delta analyzer compares to the expected answer. If divergent, four actions per dependent item:

| Action | Trigger | Effect |
|---|---|---|
| **KEEP** | Dependent is unaffected by the divergence | No change |
| **REPLACE** | Dependent is now ambiguous in a new way | Re-emit a different version of the question |
| **ADD** | Divergence creates a new ambiguity not previously detected | Add a follow-up question |
| **DROP** | Divergence resolves the ambiguity that justified the dependent question | Remove from the list |

**Hybrid implementation:**
- **Deterministic delta rules** for the 6–8 known pattern question types — authored once, fast, predictable, testable
- **AI fallback** for novel divergences not covered by deterministic rules — single Sonnet call: "user answered X instead of Y; what changes for the rest of the question list?"

**Bounded by SP-9** (one re-prompt maximum on AI calls): the AI fallback can fire at most once per pattern question. If it fails to converge, defaults to KEEP-everything and surfaces a generic "we updated our reading — please review" note before Stage A.

**Citation:** This session — user explicit framing: "if the answer is unexpected then we should potentially take into consideration what they said and determine and then decide on any new questions but not to completely remove the existing questions."

---

### V1.5-Δ4. Sonnet self-reorganization pass on clarification questions

**V1 state:** Stage A produces clarification_questions in whatever order Sonnet emits them. Quality validator (V1-Δ6) checks structure but not order or grouping.

**V1.5 state:** After Stage A returns its raw question list and after V1-Δ6's quality validator passes, run **one additional Sonnet call** with this prompt:

> *"You produced these N clarification questions. Reorganize them for clarity. Apply these rules:*
> *— Group questions by topic. Topics: Services / Audience / Cadence / Giving / Stats / Volunteers / Other.*
> *— Within each group, order foundational questions before dependent ones (e.g., 'are these two separate services' before 'what time does each meet').*
> *— Drop any question whose answer is now implied by another question's answer.*
> *— Tighten wording: replace technical terms with church-language equivalents. Don't change meaning, only phrasing.*
> *— Tag each question with its topic group for the UI to render headers.*
> *Return the same questions, reorganized. Do not add new questions. Do not remove information."*

**Output:** Same JSON shape, ordered + grouped, with `topic_group` field added per question.

**Bounded by SP-9:** at most one reorganization call per import. If it fails (returns malformed JSON, drops questions, or adds new ones), fall back to Stage A's original order.

**Why this works:** Sonnet's *first-pass* output is generated under the cognitive load of classification. Asking it to *review* its own output, with a tighter scope (just reorder + group + tighten), produces meaningfully cleaner UX. Same model, narrower task, better result.

**Citation:** This session — user explicit framing: "I'm just going to let Sonnet reorganize its questions for more clarity when it re-loops."

---

### V1.5-Δ5. Church-language UI labels (kill MAIN/KIDS/YOUTH from the user surface)

**V1 state:** Internal `audience_group_code` values (MAIN, KIDS, YOUTH) appear in clarification questions, confirm UI dropdowns, and Humanizer output. Even Daxx (the product owner) finds the audience question confusing because the labels expose internal abstractions.

**V1.5 state:** The internal codes never appear in user-facing copy. UI labels use church-language equivalents:

| Internal code | UI label |
|---|---|
| MAIN | "Adults" or church-specified term (e.g., "Members") |
| KIDS | "Kids" or church-specified term (e.g., "LifeKids", "Children's Ministry", "Sprouts") |
| YOUTH | "Students" or "Teens" or church-specified term (e.g., "Switch", "Catalyst") |

**Detection:** When PatternReport surfaces a column header or row value that contains a church-specific name (e.g., "LifeKids" appears in 200 rows), the UI uses *that* word in questions:

> *"Volunteers in your **LifeKids** ministry — who do they primarily serve?"*

Not:
> *"Volunteers with audience_group_code=KIDS — confirm audience type."*

**Implementation:** A label-resolver function lives between the question library and the Humanizer. Given an internal code + the PatternReport's detected names, it produces user-facing labels. If no church-specific name detected, fall back to defaults (Adults / Kids / Students-Teens).

**Per-church terminology customization** (full per-church label override) is deferred. V1.5 uses detected names where available, defaults otherwise.

**Citation:** This session — user explicit critique: "the questions for audience are so hard to understand. What you're asking, because we have adult, we put them in MAIN. I think it's even so that I understand SundayTally I still don't understand."

---

### V1.5-Δ6. Pattern Question Library (deterministic templates with delta rules)

**V1 state:** No deterministic question library exists. All questions come from Stage A's AI-generated output (with V1-Δ6 quality validation post-hoc).

**V1.5 state:** A typed catalog of pattern-confirmation questions. Each entry includes:
- Trigger condition (PatternReport conditions that fire it)
- Question copy template (with placeholders for detected values)
- Expected answers
- Delta rules per branch (used by V1.5-Δ3)
- Internal routing decision per answer

#### V1.5 Question Library v1 — 8 entries

**Q-PAT-1 — Service structure (the three-meaning question)**
- Trigger: PatternReport has audience-suffixed columns/rows AND multi-service-per-day pattern
- Copy: See V1.5-Δ2 above
- Branches: M1 / M2 / M3 / Other
- Delta rules: M3 → keep audience routing questions, drop "is this one combined service" question. M1 → drop volunteer-per-audience-experience question. M2 → ADD per-audience template definitions, REPLACE day_of_week question with per-audience day question.

**Q-PAT-2 — Service count confirmation**
- Trigger: PatternReport detects 2+ service templates
- Copy: *"We see N services in your data: [list of detected names]. Match your church?"*
- Branches: Confirm / Combine some / Add missing / Rename
- Delta rules: Combine some → REPLACE downstream per-template questions with combined version. Rename → KEEP all routing decisions, just update display_names.

**Q-PAT-3 — Audience terminology check**
- Trigger: Audience-suffixed columns OR audience-tagged rows detected
- Copy: *"We're reading your data as: [detected_adult_term]→Adults, [detected_kid_term]→Kids, [detected_student_term]→Students. Right?"*
- Branches: Confirm / Remap / Skip an audience entirely
- Delta rules: Skip → DROP all questions about that audience's routing. Remap → REPLACE downstream questions with corrected mapping.

**Q-PAT-4 — Date range confirmation**
- Trigger: Always
- Copy: *"Your data covers ~N weeks from [min_date] to [max_date], mostly [detected_day_of_week]s. Match your records?"*
- Branches: Confirm / Range is wrong / Different cadence
- Delta rules: Different cadence → REPLACE cadence-detection results with user-supplied; trigger Q-PAT-5 for verification. Range wrong → re-query Pattern Reader with corrected scope.

**Q-PAT-5 — Cadence per metric**
- Trigger: Pattern Reader's median-gap analysis detects something other than weekly
- Copy: *"Your '[column_name]' data appears [detected_cadence]. Is that right?"*
- Branches: Confirm / Different cadence / Mixed cadence
- Delta rules: Different cadence → REPLACE Stage A's routing for this metric. Mixed → ADD a question asking which cadence to honor.

**Q-PAT-6 — Giving scope (per-service or church-wide)**
- Trigger: PatternReport has giving columns
- Copy: *"For the [giving_column_name] data, are these amounts: [Per-service offerings (e.g., what was collected at a specific service)] / [One weekly church-wide total covering everything] / [Something else]"*
- Branches: Per-service / Church-wide weekly / Mixed / Something else
- Delta rules: Church-wide weekly → ADD question about deposit-day vs Sunday-of-week anchor. Per-service → ADD question about which services collect.

**Q-PAT-7 — Volunteer audience (who they serve)**
- Trigger: PatternReport detects volunteer columns where the column-name token appears in a youth-or-kids-tagged service template's display_name
- Copy: *"These '[volunteer_column_name]' volunteers — who do they serve?"*
- Branches: Adults in main service / Kids ministry / Students/youth ministry / Multiple groups
- Delta rules: Multiple → SET audience_group_code to whichever they primarily serve, ADD note that they cross-serve.

**Q-PAT-8 — Date format (only when ambiguous)**
- Trigger: Pattern Reader detects dates that could be MM/DD/YYYY OR DD/MM/YYYY (e.g. all values < 13 in both first and second positions)
- Copy: *"Your dates look like [example]. Are they MM/DD/YYYY or DD/MM/YYYY?"*
- Branches: MM/DD / DD/MM / Other format
- Delta rules: Re-parse all dates with corrected format.

**Library is versioned with the Standard.** Adding a new pattern question requires SP-1 (SAGE gate) + SP-2 (AXIOM audit) + a changelog entry per SP-4.

**Citation:** Question types compiled from this session's empirical findings (3-meaning audience, cadence detection, giving scope ambiguity, volunteer audience, date format edge case).

---

## V1.5 — What's NOT changing

- **No model swaps.** Same Opus/Sonnet/Haiku assignments as V1.
- **No schema changes** beyond what V1 already proposes (V1's import_diagnostics table from Δ4).
- **No removal of V1 deltas.** All 7 V1 changes still apply.
- **No per-church terminology customization** (use detected names + defaults for V1.5; full custom override is V2 work).
- **No changes to Stage B writer or row extraction logic** beyond what V1 specifies.

---

## V1.5 Pros

### V1.5-P1. Pattern verification before classification eliminates compounding misreads.
**Citation:** V1.5-Δ1.
**Evidence:** V0 evaluation surfaced cases where Pattern Reader misread audience structure and Stage A then made routing decisions on top of the misread. V1.5's confirmation phase forces explicit user verification of detected facts before any routing decision is made.

### V1.5-P2. The audience question becomes answerable.
**Citation:** V1.5-Δ2 + V1.5-Δ5.
**Evidence:** This session — user explicitly stated even they (the product owner) couldn't parse the V0/V1 audience question. V1.5 reframes the question as a structural choice (M1/M2/M3) with church-language labels, removing the conceptual abstraction the user got stuck on.

### V1.5-P3. Adaptive logic responds to user corrections without losing valid context.
**Citation:** V1.5-Δ3.
**Evidence:** This session — user framing: "if the answer is unexpected then we should potentially take into consideration what they said and determine and then decide on any new questions but not to completely remove the existing questions." V1.5's hybrid delta analyzer keeps what's valid (KEEP), refines what isn't (REPLACE/ADD), and drops what's no longer needed (DROP) — exactly the user's described behavior.

### V1.5-P4. Sonnet's self-reorganization makes question UX coherent.
**Citation:** V1.5-Δ4.
**Evidence:** V1 12-shape suite: question count varied 2 to 5 per shape with no organization. Reorganization pass groups by topic, orders by dependency. User scans a logical narrative instead of a random list.

### V1.5-P5. Three-meaning audience framework handles real church complexity.
**Citation:** V1.5-Δ2.
**Evidence:** This session — user revealed Demo Church is M3 (parallel experiences within a service slot), which V0/V1 implicitly assumed was M1. V1.5 surfaces the structural choice explicitly. Future churches with different structural patterns are accommodated without code changes.

### V1.5-P6. Question library makes pattern questions versionable + testable.
**Citation:** V1.5-Δ6.
**Evidence:** V0/V1 cons (V1-C5 documentation drift): rules in code drift over time. V1.5's question library is its own typed catalog — each entry has trigger conditions, copy, branches, delta rules. AXIOM-auditable, KEEPER-trackable, semver-versioned per SP-4.

### V1.5-P7. AI judgment is preserved for what AI is actually good at.
**Citation:** V1.5-Δ1 + V1.5-Δ3.
**Evidence:** Pattern questions are deterministic. The structural-meaning question (Q-PAT-1) is AI-inferred but user-confirmed. The delta analyzer is hybrid — deterministic for known cases, AI fallback for novel. V1.5 narrows AI's job to "where data alone can't decide" — exactly the line the user surfaced this session.

### V1.5-P8. Internal code abstraction never leaks to users.
**Citation:** V1.5-Δ5.
**Evidence:** V1's user surface still showed MAIN/KIDS/YOUTH in the confirm UI. V1.5 forbids this — labels are always church-language. Reduces the cognitive load that even the product owner found confusing.

---

## V1.5 Cons

### V1.5-C1. Pattern confirmation adds an additional onboarding phase.
**Status:** REAL UX cost. Onboarding total interaction time grows from V1's ~3-4 min to ~5-8 min depending on detected divergences.
**Mitigation:** SP-5 quarterly review tracks onboarding-time-to-completion via diagnostics; if a specific pattern question is consistently auto-confirmed without divergence, it can be silenced or shown only as a non-blocking "we detected X" notification.

### V1.5-C2. AI fallback in delta analyzer adds variability.
**Status:** REAL. The hybrid (deterministic + AI fallback) means novel divergences trigger an AI call. Output is bounded by SP-9 but introduces some non-determinism at the edges.
**Mitigation:** Telemetry (V1-Δ4) captures every fallback fire. Quarterly review (SP-5) examines fallback outcomes — if a pattern emerges, it gets promoted to a deterministic delta rule in the question library.

### V1.5-C3. Sonnet self-reorganization adds one extra Sonnet call per import.
**Status:** REAL cost increase. ~$0.05 per import (~+15-20% AI cost over V1).
**Mitigation:** User explicitly deprioritized cost in favor of clarity. Bounded by SP-9 (one call max). Falls back gracefully to original order if the call fails.

### V1.5-C4. Question library requires authoring + ongoing maintenance.
**Status:** REAL. Each new pattern question type is engineering work + AXIOM audit + SAGE gate per SP-1/SP-2.
**Mitigation:** v1 of the library has 8 entries (covered in V1.5-Δ6), enough for the empirical patterns observed across 24 test runs. New entries added quarterly per SP-5 from telemetry.

### V1.5-C5. Pattern confirmation can feel like AI uncertainty.
**Status:** RISK. Asking "is this what we see right?" might read to a user as "the AI isn't sure," undermining confidence.
**Mitigation:** Framing matters — phrase as confirmation, not interrogation. *"We detected 3 services in your data — confirm these match your church"* rather than *"How many services do you have?"* AXIOM audit at v1.0 release reviews question copy for tone.

### V1.5-C6. Three-meaning audience question may feel over-engineered for simple churches.
**Status:** REAL for churches with simple data shapes (M1 with no audience splits). They're asked to choose among three options when only one applies.
**Mitigation:** Q-PAT-1 only fires when audience-suffixed data is detected. Churches without audience splits never see it. For churches that do have audience splits, the three-option choice is genuinely needed — the data alone can't tell us which meaning applies.

### V1.5-C7. Implementation cost grows from V1's ~12 days to ~18-22 days.
**Status:** REAL. V1.5 adds:
- Pattern Confirmation Phase + question library (4-5 days)
- Three-meaning structural question + routing logic per branch (2-3 days)
- Adaptive delta analyzer (deterministic rules + AI fallback) (3-4 days)
- Sonnet self-reorganization pass + integration (1-2 days)
- Church-language label resolver (1-2 days)
- Tests + Demo Church re-import + first quarterly review dry-run (3 days)
**Mitigation:** V1.5 is V1's finishing layer. Build V1's foundation first; V1.5's additions sit cleanly on top. Don't try to ship them simultaneously.

### V1.5-C8. Risk of question fatigue if SP-5 quarterly review isn't actually run.
**Status:** RISK. Every clarity gain assumes the question library is being refined based on telemetry. Without quarterly review, the library stagnates and questions accumulate over time.
**Mitigation:** SP-5 is a sealed protocol; if it's not running, the broader Standard discipline has failed and that's a higher-priority issue than V1.5 specifically.

---

## Pressure Test — V0 vs V1 vs V1.5 (3-way comparison)

Same dimensions as V1's pressure test, plus one new dimension specific to V1.5 (pattern verification clarity).

### Dimension 1: Correctness of classifications
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 3 | 5 | 5 |
| Reasoning | LifeKids regression, volunteer audience drift | Bidirectional coercion + volunteer-audience guard | Same as V1 — invariants are unchanged |

**V1 ≈ V1.5; both decisively beat V0.**

### Dimension 2: Question quality (UX of clarification surface)
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 3 | 4 | 5 |
| Reasoning | Variable, no quality bar | Server quality validator | + Sonnet reorganization + topic grouping + church-language labels |

**V1.5 wins clearly.**

### Dimension 3: Robustness to AI/model drift
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 2 | 5 | 5 |
| Reasoning | Prose drift demonstrated | SP-7 + SP-8 + telemetry | Same as V1 |

**V1 ≈ V1.5; both beat V0.**

### Dimension 4: Onboarding success rate
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 3 | 4 | 5 |
| Reasoning | LifeKids regression silently misroutes | Coercion + guards | + pattern-confirmation phase eliminates upstream misreads compounding into downstream miscategorizations |

**V1.5 wins.**

### Dimension 5: Learning velocity
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 1 | 4 | 4 |
| Reasoning | No telemetry | import_diagnostics + quarterly review | Same as V1 |

**V1 ≈ V1.5; both decisively beat V0.**

### Dimension 6: Maintenance burden
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 2 | 5 | 4 |
| Reasoning | 6 files, 3 languages | Sealed protocols + Standard externalized | Same protocols + question library adds maintenance surface |

**V1 wins. V1.5 has slightly higher maintenance because of the question library, but it's bounded by SP-1/SP-2 discipline.**

### Dimension 7: Cost (token spend, latency)
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 4 | 3 | 2 |
| Reasoning | Cheapest baseline | +1 conditional re-prompt | + Sonnet reorganization (always) + AI fallback in delta analyzer (sometimes) |

**V0 wins. V1.5 is the most expensive — user explicitly accepted this trade for clarity.**

### Dimension 8: Implementation cost
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 5 | 2 | 1 |
| Reasoning | Already shipped | ~12 days | ~18-22 days (V1's 12 + V1.5's 6-10 additional) |

**V0 wins.**

### Dimension 9: Adaptability to new shapes
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 3 | 4 | 5 |
| Reasoning | AI judgment, no structural framework | + cadence detection, value_type | + three-meaning audience framework + question library + adaptive delta logic |

**V1.5 wins clearly.**

### Dimension 10 (NEW): Pattern verification clarity
| | V0 | V1 | V1.5 |
|---|---|---|---|
| Score | 1 | 2 | 5 |
| Reasoning | No pattern verification phase exists; user reviews routing decisions only | Same — user reviews routing decisions, can override individually but no upstream pattern verification | Pattern Confirmation Phase explicitly verifies what was detected before any routing decision happens |

**V1.5 wins decisively. This is V1.5's signature gain.**

---

## Pressure Test Synthesis (Implementation dimension removed)

**Note on Implementation:** The pressure test originally included an "Implementation cost" dimension. That's removed because the user is building this with AI and dev cost is not a factor. What remains are the 9 dimensions that affect the *running* product.

| Dimension | V0 | V1 | V1.5 |
|---|---|---|---|
| 1. Correctness | 3 | 5 | 5 |
| 2. Question quality | 3 | 4 | **5** |
| 3. Robustness to drift | 2 | 5 | 5 |
| 4. Onboarding success | 3 | 4 | **5** |
| 5. Learning velocity | 1 | 4 | 4 |
| 6. Maintenance | 2 | **5** | 4 |
| 7. Cost | **4** | 3 | 2 |
| 9. Adaptability | 3 | 4 | **5** |
| 10. Pattern verification clarity (new) | 1 | 2 | **5** |
| **Total (out of 45)** | **22** | **36** | **40** |
| **vs V0** | — | +14 | +18 |
| **vs V1** | — | — | +4 |

V1.5 wins outright on 5 dimensions (Question quality, Onboarding success, Adaptability, Pattern verification clarity, plus ties at the top of Correctness/Robustness). Loses to V1 on Cost (per-import runtime spend) and Maintenance (slightly higher because of the question library) — both bounded.

V1.5 advantage over V1: **+4 net score**, concentrated in clarity dimensions (the user's explicit priority).

**What changed by removing Implementation:** V0's "wins on implementation speed" argument collapses. The only honest reason to stay on V0 is per-import cost. The only honest reason to stop at V1 instead of V1.5 is per-import cost + ongoing maintenance burden — both small at current scale.

---

## V1.5 vs V1 — Honest synthesis

V1.5 is **V1's clarity finishing layer**. Everything V1 does (structural correctness, drift robustness, learning loop) survives untouched. V1.5 adds:

1. A pattern verification phase before AI routing (pattern questions before routing questions)
2. The audience question redesign that even the product owner can parse
3. Adaptive logic that respects user corrections
4. Sonnet's self-reorganization for cleaner question UX

The trade-offs are real and unidirectional: V1.5 costs more (tokens + implementation days) and adds maintenance (question library) in exchange for clarity at the user surface and accuracy on novel church shapes.

**Where V1 alone is enough:**
- Single-shape church onboarding where Pattern Reader's reading is clearly correct
- Pre-launch project still iterating on basics
- When implementation time is the binding constraint

**Where V1.5 is meaningfully better:**
- Diverse church onboardings where structural meaning matters (your case — Meaning M3 was invisible without the structural question)
- Production scale where onboarding success rate is a customer-retention signal
- When the user surface has to be self-explanatory without a hand-holding session

---

## Recommendation (Implementation cost removed from gating)

**Ship V1 + V1.5 in close succession, with a brief telemetry validation cycle between them. The phasing is for risk reduction and signal capture — not implementation cost.**

| Phase | Build | Validation gate before next phase |
|---|---|---|
| **V1.0** | Sealed protocols + 7 V1 deltas | Telemetry shows synthesizer guards firing as expected, no malformed AI output, no regressions vs V0 baseline |
| **V1.1** (after 2-4 weeks of V1.0 telemetry) | V1.5-Δ1 + V1.5-Δ6 (Pattern Confirmation Phase + question library v1) | Pattern questions fire correctly; user override rate trending down |
| **V1.2** (immediately after V1.1) | V1.5-Δ2 + V1.5-Δ5 (three-meaning audience question + church-language labels) | Audience question completion rate; Q-PAT-1 answer distribution captured |
| **V1.3** (immediately after V1.2) | V1.5-Δ3 (adaptive delta analyzer) | Delta rule fire rate; AI fallback frequency manageable |
| **V1.4** (immediately after V1.3) | V1.5-Δ4 (Sonnet self-reorganization) | Reorganization quality validated by user feedback / overrides |

Total elapsed from V1.0 ship → V1.5 complete: roughly **4-8 weeks**, gated on telemetry signal between V1 and V1.5 launch.

**Why phase rather than ship V1+V1.5 simultaneously:**
- **Sequencing risk reduction.** Smaller batches catch problems faster. If something in V1's foundation is wrong, you find it before building V1.5 on top.
- **Telemetry signal validates V1.5 is needed.** If V1's diagnostics show pattern misreads aren't actually happening at significant rate, V1.5's value drops. Ship V1, observe, then commit.
- **AI iteration speed.** Building two layers in sequence with feedback between them produces better outcomes than one giant push.

**What's no longer a reason to phase:** implementation cost. Per the user's framing (AI is building this; dev cost not a factor), the calendar gap between V1 and V1.5 is *only* what telemetry validation requires — not engineering hours.

**Honest read on whether to skip V1 and go straight to V1.5:** tempting but risky. V1's sealed protocols + telemetry are the foundation V1.5 sits on. Without V1's `import_diagnostics` table, you can't validate V1.5's clarity gains empirically. Without SP-2's AXIOM audit pattern, V1.5's question library accumulates rules without evidence. V1 isn't optional even if it's quick to build.

---

*End of V1.5 + 3-way pressure test. Decision flow: V0 → V1 (now) → telemetry validation (2-4 weeks) → V1.5 (next).*
