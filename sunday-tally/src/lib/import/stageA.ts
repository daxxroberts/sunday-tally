import 'server-only'
// HMR nudge
import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, assertBudget, runToolLoop } from '@/lib/ai/anthropic'
import { recordUsage } from '@/lib/ai/budget'
import type { NormalizedSource, SourceInput } from './sources'
import { getAllRows } from './sources'
import { runPatternReader, type PatternReport } from './stageA_pattern'
import { generatePatternQuestions } from './pattern_questions'
import { validateMapping, interpretViolations, applyPatches, dedupeClarifications } from './stageA_validate'
import type { ConfirmedSourceMapping } from './stageB'

// ── Sonnet v2 System Prompt (Decision Maker — 9 framework rules) ──────────────

const STAGE_A_SYSTEM = `You are the Decision Maker stage of SundayTally's AI onboarding pipeline.

You receive a PatternReport from the Pattern Reader (Sonnet by default; Opus only via the IMPORT_PATTERN_READER_MODEL override) and produce ONE propose_mapping call covering:
- setup entities (locations, ministry_tags, reporting_tags, service_templates, metrics)
- column routing (how each tracked number maps to a metric)
- clarification questions for the user

You do NOT read the raw data. The PatternReport contains everything you need.

== THE DATA MODEL: ONE CONCEPT — A METRIC ==

SundayTally has ONE data concept: a metric. A metric is the definition of one tracked
number, equal to (ministry_tag × reporting_tag × scope). A value for that metric on a
given service or week is a metric_entry.

  - WHO the number is about  → the ministry_tag (and its tag_role).
  - WHAT dimension it is     → the reporting_tag.
  - SERVICE-level vs WEEKLY  → the metric's scope ("instance" | "period").

There are NO separate attendance / volunteer / response / giving tables anymore, and
audience (main/kids/youth) is NOT a suffix. "Kids attendance" is simply a metric whose
ministry_tag has tag_role=KIDS_MINISTRY and reporting_tag=ATTENDANCE.

The 4 reporting_tags are PRE-SEEDED at signup — reference them by code, never declare them:
  - ATTENDANCE     headcount (count)
  - VOLUNTEERS     people serving (count)
  - GIVING         dollar amounts (currency)
  - RESPONSE_STAT  any other pastoral/operational stat (baptisms, salvations, guests,
                   parking cars, rooms open, hands raised, etc.) (count)
Declare a CUSTOM reporting_tag only when a tracked dimension fits none of these 4.

YOU MUST, for every tracked number in the data:
  (a) declare the ministry_tag it belongs to (with inferred tag_role),
  (b) declare a metric (ministry_tag + reporting_tag + scope + is_canonical),
  (c) map the feeding column to dest_field "metric.<METRIC_CODE>".

== THE 9 FRAMEWORK RULES ==

RULE 1 — CONFIDENCE THRESHOLDS BY WEEKS_OBSERVED
Compute weeks_observed yourself: floor((days between date_range.max and date_range.min) / 7) + 1.
This field does NOT exist in the PatternReport — you calculate it from date_range.min and date_range.max.

Apply these thresholds STRICTLY. Confidence is a function of weeks_observed, NOT of how clean
or complex the data appears or how many ambiguities you noticed:
  - weeks_observed >= 26              → confidence = "HIGH"
  - 12 <= weeks_observed < 26         → confidence = "MEDIUM"
  - weeks_observed < 12               → confidence = "LOW_CONFIDENCE" + include low_confidence_note

DO NOT downgrade confidence below the threshold for that week count because the data looks
unfamiliar or because there are ambiguities. Ambiguities go in clarification_questions, not in
confidence. If you have a specific data-quality concern (e.g. dates malformed, weeks span looks
wrong, calendar gap detected), express it in low_confidence_note WITHOUT lowering the confidence
band — the band stays tied to weeks_observed. The only legal downgrade is when weeks_observed
itself is small.

Below 12 weeks: still produce a mapping, but do NOT propose seasonal or sparse patterns.

RULE 2 — PATTERN COLLAPSE AT 2 IDENTICAL QUESTIONS
Scan your question list before finalising. When 2+ questions share the same option set AND same decision
type: keep the FIRST as a normal question, replace ALL remaining with ONE policy_collapse question that
lists affected metrics and offers: "Apply same rule to all" / "Decide each separately" / "Something else".
Never produce 3 or more structurally identical questions in a row.

RULE 3 — NO NUDGING
Never write: "Many churches prefer...", "Consistent with your earlier choice...", "We recommend...",
"The standard approach is...". Each option must sound equally legitimate.

RULE 4 — MINISTRY TAGS ARE FIRST-CLASS
Every ministry_tag you declare must have: code, name, AND tag_role
(ADULT_SERVICE | KIDS_MINISTRY | YOUTH_MINISTRY | OTHER). Every service_template's
primary_tag MUST be a declared ministry_tags.code. Choose the ministry tag based on the
service's core identity: a general worship service is an ADULT_SERVICE ministry; a
dedicated children's service is a KIDS_MINISTRY ministry (e.g. LifeKids); a student
service is a YOUTH_MINISTRY ministry (e.g. Switch).

tag_role INFERENCE — infer from the ministry name/context:
  - kids / children / nursery / "LifeKids"            → KIDS_MINISTRY
  - youth / students / "Switch" / middle/high school  → YOUTH_MINISTRY
  - main adult service / weekend service / experiences → ADULT_SERVICE
  - parking-lot counts / online / misc                → OTHER
When the role is genuinely unclear (e.g. an ambiguous ministry name), DO NOT guess —
emit a clarification question (with a visual_tree) instead.

Audience (main/kids/youth) is NOT a column suffix and NOT a tag distinction — it is
carried by the ministry tag's tag_role. Define the service by its ministry, not by an
"audience".
If the data doesn't clearly justify a service's ministry → mark display_name as
[BLOCKING] and add a blocking question.

RULE 5 — TAGS MUST BE EARNED
Only propose a distinct primary_tag when:
  (a) it applies to a recurring set of occurrences (not one-offs)
  (b) it meaningfully distinguishes from other services (different content, audience, or format —
      NOT just a different time of day)
  (c) it would produce a dashboard row the church actually wants to see
If two services have identical patterns → same tag. Don't manufacture distinctions.

RULE 5a — TIME-OF-DAY IS NEVER A TAG DISTINCTION (HARD RULE)
Multiple occurrences of the same conceptual service share ONE primary_tag. They differ only by
start_time on the service_template, never by a tag.

  ✓ "Experience 9AM" and "Experience 11AM" (same content, different start time) →
    TWO service_templates, both with primary_tag="EXPERIENCE", different start_time values.
    DO NOT create EXP1, EXP2, EXP_AM, EXP_PM, EXPERIENCE_9AM, or any time-variant child tag.

  ✓ Service Type values "1", "2" with the user describing them as "9AM service" and "11AM service" →
    SAME root noun in description → ONE primary_tag shared across both templates.

  ✗ NEVER create child tags to "distinguish" two services that are the same ministry at
    different times. Time lives in start_time, not in the tag namespace.

When to DO create distinct primary_tags across multiple service_templates:
  ✓ Different content/format described in distinct nouns: "9AM Traditional" + "11AM Contemporary"
    → primary_tag=TRADITIONAL + primary_tag=CONTEMPORARY (description used distinct nouns)
  ✓ Different language/audience: "9AM English" + "6PM Spanish" → ENGLISH + SPANISH
  ✓ Different ministry entirely: "Sunday Experience" + "Wednesday Switch" → EXPERIENCE + SWITCH

Disambiguator rule: parse the user's description.
  · Services that share a root noun (Experience, Experience) and differ only in time → SAME tag.
  · Services described with distinct nouns or audiences → DISTINCT tags.
  · No description provided AND values are opaque ("1", "2") → assign all templates the SAME
    default primary_tag (e.g. MORNING or based on source ministry context) and add a blocking
    clarification_question asking whether the services are the same ministry at different times,
    or genuinely different services. Do NOT invent a tag distinction to fill the gap.

RULE 6 — MINISTRY HIERARCHY (parent_code adjacency)
Express ministry hierarchy by setting parent_code on a ministry_tag to the code of its
parent ministry_tag (adjacency only — there is no separate tag_relationships array).
Set parent_code ONLY when the data shows a genuine ministry-grouping pattern the user
would want to see on the dashboard as parent→child rollups.
  ✓ "LifeKids" with parent_code="EXPERIENCE" when LifeKids rides inside Experience
    occurrences and the church wants aggregated EXPERIENCE totals that include LifeKids
Do NOT set parent_code to express:
  · Time-of-day variants (handled by start_time on the template — see Rule 5a)
  · The fact that two service templates share a tag (already expressed by sharing primary_tag)
  · "Anything I can't otherwise distinguish" — that's a blocking clarification, not a hierarchy
Volunteer sub-roles are now expressed as separate METRICS (same ministry_tag,
reporting_tag=VOLUNTEERS, one canonical + the rest is_canonical=false), NOT as tags.

RULE 7 — DATE-DERIVABLE PATTERNS ARE NOT TAGS
Never propose: JANUARY, FEBRUARY, SUMMER, WINTER, FIRST_SUNDAY, LAST_SUNDAY, 2024, 2025.
The dashboard query layer computes these from service_date. A tag for them adds nothing.

RULE 8 — CONSISTENT QUESTION FORMAT
Every question uses the same structured format regardless of how the UI delivers it.

RULE 8a — STRUCTURAL QUESTIONS MUST POPULATE visual_tree (separate field)
When a clarification question touches a parent-child relationship — service templates,
tag hierarchy, ministry routing, category-to-tag assignment, audience scoping — you MUST
populate the "visual_tree" field on the question with a small ASCII hierarchy showing the
proposed structure and the affected nodes.

DO NOT embed the tree inside the "question" text. Put it in "visual_tree". The UI renders
the question as prose and the tree in a monospace block side-by-side. Embedding in question
text causes the tree to collapse into proportional font and become unreadable.

Format for the visual_tree value (use literal box-drawing characters):

  EXPERIENCE (Sunday)
    ├─ Service 1 (9 AM)
    └─ Service 2 (11 AM)
  SWITCH (Wednesday)

Keep trees under 8 lines. If more nodes are involved, ask a narrower question first.

When NOT to populate visual_tree:
  - Single scalar question (one name, one time, one binary yes/no with no hierarchy)
  - Data-semantics questions about column relationships with no parent-child structure
  - Data-validation questions like "is this large value real" with no hierarchy

Why this matters: parent-child decisions are catastrophic if wrong (the user may load
hundreds of occurrences before noticing). A visual hierarchy lets the user check the
structure at a glance instead of parsing prose.

RULE 8b — WHEN IN DOUBT, ASK
For ambiguous routing decisions (which ministry a stat belongs to, whether two services are
the same ministry at different times vs different ministries, whether a column is a venue-wide
stat vs scoped) — prefer a clarification_question over a confident guess. The cost of asking
once is small. The cost of silently mis-routing 400 occurrences is irreversible without
manual cleanup the user cannot perform.

A clarification_question is REQUIRED when:
  · A stat could plausibly belong to ≥2 ministries based on its name AND the conditional
    profile shows it appearing under ≥2 group_context values at non-negligible rates
  · Service Type values are opaque AND the description doesn't unambiguously name each one
  · A Group/ministry-context value is present that the source description didn't mention
  · A stat name pattern triggers Rule C (venue-wide) but the structural data is ambiguous
    (appears under some but not all group_context values)

Mark blocking=true when the wrong default would corrupt data without an obvious visual cue
on the review page. Mark blocking=false when the user can spot the mistake at review and fix
it inline.

RULE 9 — DAY_OF_WEEK FROM DATA
Every service_template you propose MUST include day_of_week (0=Sun..6=Sat). Infer it from the
data: if every observed service_date for a template falls on the same weekday, set that weekday.
If multiple weekdays appear, pick the dominant one and add a non-blocking clarification.

start_time is NEVER in the data — the source sheets only carry dates. Set start_time: null on
every template. The server automatically synthesizes a single q_service_times clarification
question covering all unscheduled templates, so do NOT add per-template time questions yourself.
Display name validation is handled by the confirm UI (the user can edit names inline) — do NOT
add q_name_<service_code> questions either. Keep your clarification_questions list focused on
genuine ambiguities the user must resolve before import (opaque codes, scope mismatches,
unclassified metrics) — not routine confirmations.

== MAPPING RULES ==

1. Map every observed_metric (ALL metrics, not just the sample) to a METRIC, then route its
   feeding column to dest_field "metric.<METRIC_CODE>". The whole grammar is metric-driven now.

   STEP 1 — pick the reporting_tag (the WHAT dimension):
     · headcount of people present                 → ATTENDANCE
     · count of people serving / volunteers        → VOLUNTEERS
     · dollar amount given                         → GIVING
     · any other pastoral/operational stat         → RESPONSE_STAT
       (baptisms, salvations, decisions, guests, hands raised, parking cars, rooms open, etc.)
     · a dimension none of the 4 system tags cover → declare a CUSTOM reporting_tag and use its code
     Reference system codes directly (ATTENDANCE/VOLUNTEERS/GIVING/RESPONSE_STAT) — do NOT declare them.

   STEP 2 — pick the ministry_tag (the WHO). This is the SAME source-default procedure that
     used to set primary_tag, but it now selects the metric's ministry_tag:

     SOURCE DEFAULT — for each source, the source default ministry is the ministry of the
       service templates that source feeds (via service_type_column.distinct_values, or
       default_service_template_code). If those templates roll up under a parent ministry_tag,
       use the parent (root) ministry as the default.
       ✓ Switch sheet → all rows are the Switch service → default ministry = SWITCH
       ✓ Sunday sheet → Experience 1 / Experience 2 both under EXPERIENCE → default = EXPERIENCE
       ✓ "Hands Raised" in Sunday sheet → ministry_tag = EXPERIENCE (source default)
       ✓ "Hands Raised" in Switch sheet → ministry_tag = SWITCH (same name, source resolves it)
       When a source feeds templates under different parents, pick the parent the metric most
       naturally belongs to and add a non-blocking clarification if genuinely uncertain.

     RULE A — Ministry-named override: if the metric name explicitly references a DIFFERENT
       ministry than the source default (LifeKids, Kids, Switch, Youth, Spanish, etc.) → use
       that ministry's tag code. Declare that ministry_tag if it does not exist yet.
       ✓ "LifeKids Rooms Open" in Sunday sheet → ministry_tag = LIFEKIDS (not EXPERIENCE)
       ✓ "Switch Hands Raised" in Sunday sheet → ministry_tag = SWITCH (not EXPERIENCE)
       ✓ "Kids Baptisms" → ministry_tag = the kids ministry

     RULE B — Source default applies: per-service metric whose name has no qualifier pointing
       at a different ministry → use the source-default ministry.
       ✓ "Salvation Cards" in Sunday sheet → EXPERIENCE
       ✓ "First Time Guests" in Switch sheet → SWITCH

     RULE C — Venue/facility (STRUCTURAL GATE — name match alone is NOT sufficient):
       A metric is "venue-wide" only if BOTH hold: (1) the name matches a building/facility/
       stream concept (Parking, Cars in Lot, Seats Open, Rooms Available, Online Viewers, etc.)
       AND (2) the conditional profile shows it under ALL group_context values at similar rates.
       If (1) holds but (2) fails (it appears under only ONE ministry) → assign THAT ministry.
       The data overrides the name pattern.
       For a genuinely venue-wide metric, assign it to an OTHER-role ministry_tag (e.g. a
       "Church-Wide" or "Facilities" ministry with tag_role=OTHER) — every metric MUST have a
       ministry_tag, so do not leave it unassigned.
       ✓ "Parking" under Experience only → ministry_tag = EXPERIENCE (name pattern lies)
       ✓ "Online Viewers" under all groups equally → an OTHER-role church-wide ministry

   STEP 3 — pick the scope:
     · "instance" — the number is produced by / tracked per service occurrence (DEFAULT).
     · "period"   — a CHURCH-WIDE WEEKLY (or monthly) total not tied to any one service. The
                    writer snaps the row date back to its Sunday and stores it period-anchored.
                    Use "period" when the value is a weekly/monthly aggregate (e.g. "Weekly
                    Guests", "Monthly Salvations"), OR for giving that is one weekly church-wide
                    total (source has only a date + amount columns, or dates land on non-service
                    days like Mondays/Tuesdays), OR when the user describes it as a weekly total.
     Scope is read from the METRIC, never encoded in the column. There is no period_* dest_field.
     When uncertain instance vs period (e.g. per-service offerings vs one weekly total), ask a
     blocking clarification with options "Per-service" / "One weekly church-wide total" /
     "Something else".

   STEP 4 — pick is_canonical:
     At most ONE metric per (ministry_tag, reporting_tag) pair may be is_canonical=true. The
     first/primary metric for a pair is canonical; additional breakouts (extra volunteer roles,
     extra stats under the same ministry+dimension) are is_canonical=false. NEVER mark two
     canonical for the same pair — the validator rejects it.
     ✓ "Greeters" + "Parking Team" both ADULT_9AM × VOLUNTEERS → first one canonical, rest false.

   STEP 5 — route the column: add a column_map entry { source_column, dest_field:"metric.<CODE>" }
     (wide format), or an area_field_map entry mapping the metric/compound key to "metric.<CODE>"
     (tall format). Same code must appear in proposed_setup.metrics.

1a. NEVER silently ignore a metric (NO DERIVED/COMPUTED COLUMNS RULE). Every metric in
    observed_metrics MUST be declared as a metric AND routed to a metric.<CODE> dest_field.
    Do NOT route a column to a value you COMPUTE (a sum/average/total of other columns) — the
    dashboard derives those. If you genuinely cannot classify a metric, map its column to
    "ignore" AND add a blocking clarification_question asking the user what it represents.

1b. For every entry in ignored_columns from the PatternReport: NEVER silently discard it. If the
    column name could plausibly be something a church tracks (ANY numeric, operational, or
    pastoral metric), declare a RESPONSE_STAT metric for it (scope="instance", under the source
    default ministry), route it to "metric.<CODE>", and add a non-blocking clarification asking
    if the user wants to track it. The threshold for "plausibly church-relevant" is extremely
    low. Columns you MUST rescue include (not limited to): Hands, Parking, Cars, Rooms, Lots,
    Seats, Chairs, Decisions, Connections, First Time, New, Guests, Visitors, Prayer, Cards,
    Notes. The ONLY columns that may stay as "ignore": spreadsheet row numbers, internal
    formulas, and completely blank columns with no header meaning.

1c. MULTI-MINISTRY METRICS:
    When the same dimension is tracked at multiple ministry levels (e.g. Main attendance vs
    Kids attendance, Main volunteers vs Kids volunteers), declare a SEPARATE metric per ministry
    (same reporting_tag, different ministry_tag). Do NOT collapse multi-ministry data into one
    metric.
      - metric { ministry_tag: ADULT_9AM, reporting_tag: VOLUNTEERS, ... }
      - metric { ministry_tag: LIFEKIDS, reporting_tag: VOLUNTEERS, ... }

2. Use service_type_column.distinct_values EXACTLY for service_code values.
   NEVER add codes not observed in the data.

3. If service_type_column.is_opaque=true → ALWAYS add a BLOCKING question asking the user to name each code.
   type="text", blocking=true, NO recommended_answer, NO guessing.
   CRITICAL: If you set display_name="[BLOCKING]" on any service template, you MUST include a
   clarification_question with id="q_service_names", blocking=true, type="text" that asks the user
   to provide the real name for each opaque code. Setting [BLOCKING] without a question is a bug —
   the user has no way to answer and the import cannot proceed.

4. Use tall_format.audience_map if grouping is needed.

5. Convert open_questions from PatternReport into clarification_questions. Blockers → blocking=true.

6. For TALL format: include tall_format object with metric_name_column, value_column, audience_column.

   COLUMN ROLE ASSIGNMENT — do NOT match on column names. Each role is defined by the column's
   STRUCTURAL behaviour in the PatternReport (per-date partition profile + conditional profile +
   grouping_columns[likely_purpose]). Assign by structure:

   · metric_name_column — the column whose distinct VALUES are the metric NAMES themselves.
     Structural signal: highest distinct-value count among non-date columns (typically 5–50+),
     and on a single date this column has many distinct values (one row per metric).
     Decision-Maker check: every value of this column should be plausibly the name of something
     a church tracks (Baptism, Hands, Parking) — not a ministry, not a row type.

   · group_type_column — a column whose values are ROW-TYPE classifiers (Stats, Volunteers,
     Attenders). The PatternReport flags this as grouping_columns[likely_purpose="row_type_classifier"].
     When set, prefix compound keys: "\${groupType} / \${metricName}".

   · group_context_column — a column whose values are MINISTRY names (Experience, LifeKids,
     Switch). The PatternReport flags this as grouping_columns[likely_purpose="ministry_context"].
     It resolves the metric's MINISTRY_TAG. It is distinct from group_type_column (which, with
     metric_name, resolves the REPORTING dimension + the specific metric).
     When BOTH group_type_column AND group_context_column are set, use 3-segment compound keys
     in area_field_map, each mapping to "metric.<METRIC_CODE>":
       "\${groupType} / \${groupContext} / \${metricName}"
     e.g. "Stats / Experience / Baptism" → "metric.EXPERIENCE__BAPTISM"
          "Stats / LifeKids / Baptism"   → "metric.LIFEKIDS__BAPTISM"
          "Volunteers / Experience / Count" → "metric.EXPERIENCE__VOL__HOST_TEAM"
     The row extractor tries keys from longest to shortest — always define the most specific key.
     VERBATIM SEGMENTS: each key segment (group_type / group_context / metric_name) MUST be the
     EXACT verbatim value observed in the sheet cells — do NOT pluralize, singularize, re-case,
     or rename it. e.g. if the cell reads "Attender", the key segment is "Attender" (never "Attenders").

   · service_template_code (lives in column_map, not tall_format) — a column that splits a single
     DATE into multiple service occurrences. Structural signal: the PatternReport surfaces it as
     service_type_column (small distinct count AND each value carries the SAME metric vocabulary
     at similar present_rates — meaning the column splits the same set of metrics across two
     occurrences on the same day). Values may be opaque ("1", "2") — still route this column to
     "service_template_code" in column_map. If is_opaque=true, add a BLOCKING clarification
     question asking the user to name each code.

   COMMON FAILURE MODES to avoid:
   · Treating a ministry-context column ("Group" = Experience/LifeKids) as the metric_name_column.
     Catch: distinct count is only 2–3, and the conditional profile shows DIFFERENT metric
     vocabularies under each value. That makes it ministry_context, not metric_name.
   · Missing a service-split column because its values are opaque digits ("1", "2").
     Catch: the per-date partition profile shows the column has 2 distinct values per date AND
     the conditional profile shows the SAME metric vocabulary under both values. That is the
     service_type_column. Map it to "service_template_code".
   · Conflating service_type with group_type. They are independent — a sheet can have both,
     and the same date can be split four ways: (service 1/2) × (Stats/Volunteers).

   Column map dest_field values — EXACTLY one of these per entry (nothing else):
     "service_date"          — the date column
     "service_template_code" — the service type/code column (NEVER "service_code" — that is wrong)
     "location_code"         — the location column, if present
     "ignore"                — skip this column
     "metric.<METRIC_CODE>"  — a data value for a metric declared in proposed_setup.metrics
   There are NO attendance.*/giving.*/volunteer.*/response.*/period_* dest_fields and NO .AUDIENCE
   suffixes — every data column routes to a metric.<CODE>.
   For TALL format, the column_map only needs service_date + service_template_code. All metric
   routing goes through tall_format.area_field_map (values are metric.<CODE>). Do NOT put
   "audience", "group", "metric_name", "value", or "group_type" in column_map dest_field — those
   are not valid dest_field values.

CRITICAL RULE — EVERY SOURCE NEEDS A SERVICE TEMPLATE:
Every source that has a date column MUST resolve to a service template on every row. Without this,
ZERO rows will be imported and all data is lost. You MUST enforce both of the following:

(A) proposed_setup.service_templates MUST be non-empty. Even if the source only has giving data
    with no "service type" column, create at least one template. Use the church name or "Sunday Service"
    if the service structure is unknown. One template is better than none.

(B) For every source whose column_map does NOT include a column mapped to "service_template_code",
    you MUST set default_service_template_code on that source to one of the proposed service_codes.
    This is how the row extractor knows which service occurrence to attach each row to.
    Example: if you propose service_code "MORNING", set default_service_template_code: "MORNING".
    NEVER leave both the service_template_code column AND default_service_template_code absent on
    a source — that guarantees 100% row failure.

    EXCEPTION — pure period sources: If EVERY non-meta column in a source maps to "ignore" or to
    "metric.<CODE>" where that metric has scope="period" (no instance-scope metrics at all),
    the source needs NO template. Period rows are written period-anchored on the Sunday-of-week —
    no service occurrence is created. For these sources, leave default_service_template_code absent.

7. NULL = "not entered", not zero. Never COALESCE a metric value to 0 — a blank cell is skipped,
   not written as zero.

8. BLOCKING questions: NEVER set recommended_answer. Leave it absent.

9. If the same metric name (e.g. "Baptism") appears under multiple ministries → declare a
   separate metric per ministry (Rule 1c). If it is genuinely ambiguous whether they should be
   combined into one number or kept separate → blocking question about combining vs separating.
   type="choice".

DATE COLUMN — always explicitly set date_column on the source to the exact column name that holds the
service date. Never omit it. If date_column is absent and no column_map entry maps to service_date,
Stage B cannot find dates and every single row in the source fails with no clear error to the user.

dest_table is DECORATIVE in IR v2 — routing is metric-driven. You may omit it. If you set it, it
has no effect on extraction.

SERVICE TEMPLATES — no audience rules. Define services by their ministry_tag!
CRITICAL: Do NOT create service_templates for giving categories, funds, or metrics. Service
templates represent physical gatherings of people (e.g., 9AM Service, Youth Group). Giving (like
Tithes, Missions, Building Fund) must ONLY be expressed as METRICS with reporting_tag=GIVING —
never as a service template. Never make a service template called 'Tithes' or 'Giving'.

MULTI-SOURCE TEMPLATE RECONCILIATION — proposed_setup.service_templates is shared across all sources.
If two sources reference the same recurring service, propose ONE template with one service_code.
Do NOT create duplicate templates for the same service. Duplicate codes in Stage B mean the last
write wins — inconsistent display_name or tag values will produce unpredictable dashboard results.

== QUESTION FORMAT ==

Every question must have:
- id: stable, descriptive string (e.g. "q_service_names", "q_baptism_audience", "q_volunteer_scope")
- blocking: true | false
- type: "text" (free-text needed) | "choice" (user picks from options) | "policy_collapse"
- title: 4-8 word summary of the decision
- context: 1-2 sentences with REAL data examples from the PatternReport
- question: exactly one sentence
- data_examples: at least 2 real rows or values from the PatternReport

For type="choice" and type="policy_collapse": also include
- options: [{label (2-6 words), explanation (1 sentence)}]
  - 3-4 options max
  - Last option always: {label: "Something else", explanation: "Describe what you actually want"}

For type="text" (opaque codes, free-text answers): omit options.

policy_collapse questions also need: collapse_target_ids — list of question ids being collapsed.

recommended_answer — for non-blocking questions only (NEVER on blocking):
Set when the observed data strongly supports a default answer and the church is very likely to confirm it
(e.g. a service code observed on 52 consecutive Sundays almost certainly maps to a Sunday schedule).
Use sparingly — only when the pattern is unambiguous. Leave absent when there is genuine uncertainty.

Haiku will humanize your questions after you produce them. Be technically precise — do not humanize.

== PREVIEW DATA ==

Include preview_data.monthly_attendance: real aggregated numbers from the PatternReport.
Group by YYYY-MM. Each month: {month, main, kids, youth} where youth may be 0 if not tracked.
If you cannot compute real numbers → set preview_data: null (do NOT silently emit zeros).
The date_range.start and date_range.end come from the PatternReport date_range.`

// ── Haiku humanizer system prompt ─────────────────────────────────────────────

const HAIKU_HUMANIZER_SYSTEM = `You are a copy editor for SundayTally — a church analytics product used by pastors, church admins, and ministry staff. You receive questions (both blocking and non-blocking) and their option text, generated by a technical mapping process. Your job is to rewrite them so a non-technical church admin can read and answer them without confusion.

You do not change the meaning of the question. You do not change the number of options or what they represent. You change the language only.

The reader is a pastor or church admin. They know their church's vocabulary (services, ministries, attendance, giving). They do NOT know SundayTally's data model. They are setting up the product for the first time and want to be done quickly.

CORE RULES:

1. Strip every technical term. Replace with church-language equivalents:
   - service_template, template → service
   - service_occurrence, occurrence → week's service / Sunday
   - response_category → stat / metric / number tracked
   - volunteer_category → volunteer role / serving team
   - giving_source → giving method / how people gave
   - primary_tag, subtag → service group / category
   - MAIN, KIDS, YOUTH (as labels) → "main service" / "kids" / "students"
   - NULL → "blank" or "not entered"
   - schema, mapping, extraction, dest_field, compound key → do not mention

2. Use the church's own words from their data. If the data has "LifeKids", ask about "LifeKids volunteers" — not "kids ministry volunteers."

3. Lead with the user's outcome, not the system's structure.
   Wrong: "Should baptism be tracked per audience_type?"
   Right: "When someone gets baptized, do you want adult and kid baptisms shown as one number or two?"

4. Use contractions, plain phrasing, one idea per sentence.

5. Option labels must be 2-6 words, action-oriented, visually scannable.
   Wrong: "Combine the metrics across audience contexts as a singular dashboard row"
   Right: "Combine into one number" — Adult and kid baptisms add together each Sunday

6. Never nudge toward a right answer. Each option sounds equally legitimate.

7. The "Something else" option always reads: "Something else" — Tell me what you actually do at your church

8. Never use: seamlessly, effortlessly, leverage, utilize, robust, comprehensive, streamlined, intuitive, empower, ecosystem, holistic, synergy

OUTPUT FORMAT:
Return the same JSON structure you receive. Rewrite title, context, question, and each option's label and explanation. Do not change: id, blocking, type, data_examples, collapse_target_ids, recommended_answer, why, topic_group, meaning_code, or the JSON structure itself.

Return ONLY the JSON object. No explanation text. No markdown fences.`

// ── Tool schema ───────────────────────────────────────────────────────────────

export const PROPOSE_MAPPING_TOOL: Anthropic.Messages.Tool = {
  name: 'propose_mapping',
  description:
    'Propose how each uploaded source maps into Sunday Tally. Call exactly once. Include questions for anything ambiguous.',
  input_schema: {
    type: 'object',
    properties: {
      confidence: {
        type: 'string',
        enum: ['HIGH', 'MEDIUM', 'LOW_CONFIDENCE'],
        description: 'Set LOW_CONFIDENCE if weeks_observed < 12.',
      },
      weeks_observed: { type: 'number' },
      low_confidence_note: { type: 'string', description: 'Required when confidence=LOW_CONFIDENCE.' },

      sources: {
        type: 'array',
        description: 'One entry per uploaded source.',
        items: {
          type: 'object',
          properties: {
            source_name:  { type: 'string' },
            // dest_table is DECORATIVE in IR v2 (routing is metric-driven). Kept
            // optional only for back-compat with downstream types that still read it;
            // do not rely on it. (IMPORT_IR_V2.md §sources[] entry)
            dest_table: {
              type: 'string',
              description: 'DEPRECATED / decorative in IR v2 — routing is now metric-driven via dest_field=metric.<CODE>. Optional; may be omitted.',
            },
            date_column:  { type: 'string' },
            date_format:  { type: 'string' },
            default_service_template_code: {
              type: 'string',
              description: 'Required when no column is mapped to service_template_code. Set to one of the proposed service_codes so every row has a service to attach to.',
            },
            column_map: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source_column: { type: 'string' },
                  dest_field: {
                    type: 'string',
                    description:
                      'IR v2 grammar — EXACTLY one of: "service_date", "service_template_code", "location_code", "ignore", or "metric.<METRIC_CODE>" where <METRIC_CODE> is a metric_code declared in proposed_setup.metrics. There are NO attendance.*/giving.*/volunteer.*/response.*/period_* forms and NO .AUDIENCE suffixes anymore. Instance-vs-period is read from the metric.scope, not the column.',
                  },
                  notes:         { type: 'string' },
                },
                required: ['source_column', 'dest_field'],
              },
            },
            notes: { type: 'string' },
            tall_format: {
              type: 'object',
              properties: {
                metric_name_column:    { type: 'string' },
                value_column:          { type: 'string' },
                audience_column:       { type: 'string' },
                group_type_column:     { type: 'string' },
                group_context_column:  { type: 'string',
                  description: 'Ministry/audience context column (e.g. "Group" with values "Experience", "LifeKids"). When set with group_type_column, builds 3-segment compound keys: "GroupType / GroupContext / MetricName".' },
                audience_map:          { type: 'object' },
                area_field_map: {
                  type: 'object',
                  description: 'Maps each metric (or compound key) to a dest_field of the form "metric.<METRIC_CODE>" (the only valid data dest_field in IR v2). Key resolution order: "GroupType / GroupContext / MetricName" → "GroupType / MetricName" → "MetricName". The compound key resolves a row to a metric: ministry from group_context/audience, reporting dimension from group_type/metric_name. Must cover every observed metric.',
                },
              },
              required: ['metric_name_column', 'value_column'],
            },
          },
          required: ['source_name', 'column_map'],
        },
      },

      proposed_setup: {
        type: 'object',
        description: 'IR v2 metric-centric entities (IMPORT_IR_V2.md). One concept: a metric = (ministry_tag × reporting_tag × scope).',
        properties: {
          locations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                code: { type: 'string', description: 'Optional; slugged from name if absent.' },
              },
              required: ['name'],
            },
          },
          ministry_tags: {
            type: 'array',
            description: 'WHO each tracked number is about. Replaces service_tags + tag_relationships. Hierarchy is adjacency via parent_code (no closure table, no effective dates).',
            items: {
              type: 'object',
              properties: {
                code:      { type: 'string', description: 'Slug, unique per church (e.g. "ADULT_9AM", "LIFEKIDS", "SWITCH").' },
                name:      { type: 'string', description: 'Display name.' },
                tag_role: {
                  type: 'string',
                  enum: ['ADULT_SERVICE', 'KIDS_MINISTRY', 'YOUTH_MINISTRY', 'OTHER'],
                  description: 'Inferred from ministry name/context. Kids/children/nursery/LifeKids → KIDS_MINISTRY. Youth/students/Switch/middle-high → YOUTH_MINISTRY. Main adult/weekend/experiences → ADULT_SERVICE. Parking/online/misc → OTHER. When unsure, emit a clarification rather than guessing.',
                },
                parent_code: {
                  type: 'string',
                  description: 'Adjacency: code of the parent ministry_tag, or null/absent for a root. Use ONLY for genuine ministry-grouping rollups (e.g. LifeKids under EXPERIENCE), never for time-of-day variants.',
                },
              },
              required: ['code', 'name', 'tag_role'],
            },
          },
          reporting_tags: {
            type: 'array',
            description: 'CUSTOM reporting dimensions ONLY. Usually EMPTY. The 4 system tags (ATTENDANCE, VOLUNTEERS, GIVING, RESPONSE_STAT) are pre-seeded at signup — reference them by code in metrics, do NOT declare them here. Only list a custom dimension a church tracks that none of the 4 system tags cover.',
            items: {
              type: 'object',
              properties: {
                code:        { type: 'string', description: 'Slug, unique per church. Must NOT be one of the system codes.' },
                name:        { type: 'string', description: 'Display name.' },
                unit_kind:   { type: 'string', enum: ['count', 'currency'] },
                agg_default: { type: 'string', enum: ['sum', 'avg'] },
              },
              required: ['code', 'name', 'unit_kind', 'agg_default'],
            },
          },
          service_templates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                display_name:  { type: 'string' },
                service_code:  { type: 'string', description: 'Unique; often equals the primary ministry tag code.' },
                location_name: { type: 'string', description: 'Resolved to location_code/id.' },
                primary_tag:   { type: 'string', description: 'A ministry_tags.code — the service\'s primary ministry. Required.' },
                primary_tag_reasoning: { type: 'string', description: 'Optional: why this ministry tag is correct for this service.' },
                day_of_week: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 6,
                  description: 'Inferred from observed service_dates: 0=Sun, 1=Mon, ..., 6=Sat. Required.',
                },
                start_time: {
                  type: 'string',
                  description: 'HH:MM 24-hour, or null if unknown. Time-of-day distinctions live here, never in the tag namespace.',
                },
              },
              required: ['display_name', 'service_code', 'primary_tag', 'day_of_week'],
            },
          },
          metrics: {
            type: 'array',
            description: 'One metric per tracked number. Replaces response_categories + volunteer_categories + giving_sources + the fixed attendance buckets. A metric = (ministry_tag × reporting_tag × scope).',
            items: {
              type: 'object',
              properties: {
                metric_code: { type: 'string', description: 'Slug, unique per church. Convention: <MINISTRY>__<REPORTING>[__<SUFFIX>] (e.g. "ADULT_9AM__ATTENDANCE", "ADULT_9AM__VOL__PARKING").' },
                name:        { type: 'string', description: 'Display name.' },
                ministry_tag:  { type: 'string', description: 'A ministry_tags.code.' },
                reporting_tag: { type: 'string', description: 'A reporting_tags.code — one of the 4 system codes (ATTENDANCE, VOLUNTEERS, GIVING, RESPONSE_STAT) or a declared custom code.' },
                scope: {
                  type: 'string',
                  enum: ['instance', 'period'],
                  description: '"instance" = per service occurrence. "period" = per church-week (church-wide weekly total, snapped to its Sunday). Read by the writer to decide service_instance vs period_anchor.',
                },
                is_canonical: {
                  type: 'boolean',
                  description: 'At most ONE metric per (ministry_tag, reporting_tag) pair may be canonical. The first/primary metric for a pair is canonical; additional breakouts are false. Never mark two canonical for the same pair.',
                },
              },
              required: ['metric_code', 'name', 'ministry_tag', 'reporting_tag', 'scope', 'is_canonical'],
            },
          },
        },
      },

      anomalies: {
        type: 'array',
        items: {
          type: 'object',
          properties: { kind: { type: 'string' }, description: { type: 'string' } },
          required: ['kind', 'description'],
        },
      },

      clarification_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable, descriptive identifier. e.g. "q_service_names", "q_baptism_audience".',
            },
            blocking: {
              type: 'boolean',
              description: 'true = user must answer before import proceeds.',
            },
            type: {
              type: 'string',
              enum: ['text', 'choice', 'policy_collapse'],
              description: '"text" for free-text (opaque codes). "choice" for binary/ternary decisions. "policy_collapse" for merged repeated questions.',
            },
            title:    { type: 'string', description: '4-8 word summary of the decision.' },
            context:  { type: 'string', description: '1-2 sentences with concrete data examples.' },
            question: { type: 'string', description: 'The question itself, one sentence.' },
            options: {
              type: 'array',
              description: 'Required for type=choice and type=policy_collapse. Omit for type=text.',
              items: {
                type: 'object',
                properties: {
                  label:       { type: 'string', description: '2-6 word action phrase.' },
                  explanation: { type: 'string', description: 'One sentence.' },
                },
                required: ['label', 'explanation'],
              },
            },
            collapse_target_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Question IDs being collapsed. Only for type=policy_collapse.',
            },
            data_examples: {
              type: 'array',
              items: { type: 'string' },
              description: 'Real rows or values from the PatternReport. At least 2 required on blocking questions.',
            },
            why:                { type: 'string' },
            recommended_answer: { type: 'string', description: 'Only for non-blocking questions. NEVER on blocking.' },
            visual_tree: {
              type: 'string',
              description: 'REQUIRED whenever the question touches a parent-child relationship (service templates, tag hierarchy, ministry routing, category-to-tag assignment, audience scoping). Use box-drawing characters ─├└ to render a small ASCII tree (max ~8 lines). Show the actual nodes affected. Omit only when the question is purely scalar (a single name, a single time, a single binary toggle with no hierarchy implication).',
            },
          },
          required: ['id', 'blocking', 'type', 'title', 'context', 'question'],
        },
      },

      dashboard_warnings: {
        type: 'array',
        items: { type: 'string' },
      },

      preview_data: {
        type: 'object',
        description: 'Monthly attendance aggregation for the trend chart. Use REAL numbers. Null if cannot compute.',
        properties: {
          monthly_attendance: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                month: { type: 'string', description: 'YYYY-MM' },
                main:  { type: 'number' },
                kids:  { type: 'number' },
                youth: { type: 'number' },
              },
              required: ['month', 'main', 'kids', 'youth'],
            },
          },
          date_range: {
            type: 'object',
            properties: { start: { type: 'string' }, end: { type: 'string' } },
            required: ['start', 'end'],
          },
          note: { type: 'string' },
        },
        required: ['monthly_attendance', 'date_range'],
      },

      quick_summary: {
        type: 'object',
        description: 'KPI snapshot for the top summary cards. Compute from the PatternReport. You understand what the data contains — use that understanding to produce real numbers, not guesses. avg_main_attendance is the most important KPI — always populate it when attendance is present.',
        properties: {
          avg_main_attendance: {
            type: 'number',
            description: 'Average main (adult) attendance per service date across the date range. Null if attendance not tracked.',
          },
          avg_volunteers_per_sunday: {
            type: 'number',
            description: 'Average total volunteer count per service date. Null if volunteers not tracked.',
          },
          total_response_count: {
            type: 'number',
            description: 'Sum of all response/stat row values across the entire date range. Null if no response metrics.',
          },
          total_giving_amount: {
            type: 'number',
            description: 'Sum of all giving row values across the entire date range. Null if giving not tracked.',
          },
          low_confidence: {
            type: 'boolean',
            description: 'True if weeks_observed < 12.',
          },
          note: {
            type: 'string',
            description: 'Optional note if any number is an estimate or if data was sparse.',
          },
        },
      },
    },
    required: ['sources'],
  },
}

export interface StageAResult {
  proposedMapping: Record<string, unknown> | null
  totalCents:      number
}

// ── Preview sample builder ─────────────────────────────────────────────────────
// Fetches the second-to-last complete week from each source and maps it through
// the proposed column_map / area_field_map so PreviewGrid can show real numbers
// before Stage B writes anything.
//
// Output shape:
//   by_template: serviceTemplateCode → { dest_field → total }
//     Attendance fields (attendance.main/kids/youth) match PreviewGrid column IDs directly.
//   giving: displayName → total
//     Keyed by giving_sources[].name so PreviewGrid can produce "giving.${name}" keys.
async function buildPreviewSample(
  allRowsBySource: Array<Record<string, string>[]>,
  mapping:         Record<string, unknown>,
): Promise<{
  date:        string
  by_template: Record<string, Record<string, number>>
  giving:      Record<string, number>
} | null> {
  try {
    const sources       = (mapping.sources as any[] | undefined) ?? []
    const proposedSetup = (mapping.proposed_setup as any) ?? {}

    // Build giving-source slug → display name reverse map (slug from display name)
    const givingSlugToName: Record<string, string> = {}
    for (const src of (proposedSetup.giving_sources ?? []) as any[]) {
      if (src.name) {
        const slug = String(src.name)
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
        givingSlugToName[slug] = src.name
      }
    }

    // Also build dest_field → display name by matching each column_map giving entry's
    // source_column against giving_source names. This handles AI-generated slugs that
    // don't match the display-name slug (e.g. TITHES_OFFERINGS vs OFFERINGS_TITHES,
    // or SWITCH_GIVING vs SWITCH_FUND). Exact source_column match wins; slug-prefix
    // match is the fallback.
    const destFieldToDisplay: Record<string, string> = {}
    const givingSources = (proposedSetup.giving_sources ?? []) as any[]
    for (const sm2 of sources) {
      for (const cm of ((sm2.column_map as any[]) ?? [])) {
        const df = String(cm.dest_field ?? '')
        if (!df.startsWith('period_giving.') && !df.startsWith('giving.')) continue
        const srcCol = String(cm.source_column ?? '')
        // 1. Exact match: source_column === giving_source.name
        const exact = givingSources.find((gs: any) => gs.name === srcCol)
        if (exact) { destFieldToDisplay[df] = exact.name; continue }
        // 2. Slug prefix match: one slug is a prefix of the other
        const srcSlug  = srcCol.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
        const destSlug = df.replace(/^(period_)?giving\./, '')
        const prefix = givingSources.find((gs: any) => {
          const gsSlug = String(gs.name ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
          return gsSlug === srcSlug || destSlug.startsWith(gsSlug) || gsSlug.startsWith(destSlug)
        })
        if (prefix) { destFieldToDisplay[df] = prefix.name }
      }
    }

    const byTemplate: Record<string, Record<string, number>> = {}
    const giving:      Record<string, number>                 = {}
    let   sampleDate:  string | null                          = null

    for (let i = 0; i < sources.length; i++) {
      const sm      = sources[i]
      const allRows = allRowsBySource[i] ?? []
      if (allRows.length === 0) continue

      const dateCol = sm.date_column as string | undefined
      if (!dateCol) continue

      // Collect sorted unique dates and pick second-to-last
      const dates = [...new Set(allRows.map(r => r[dateCol]).filter(Boolean))].sort()
      const target = dates.length >= 2 ? dates[dates.length - 2] : dates[dates.length - 1]
      if (!target) continue
      if (!sampleDate) {
        // Normalize to ISO YYYY-MM-DD regardless of what format the spreadsheet uses
        // (e.g. "9/7/2025" US format → "2025-09-07"). Use local date parts to avoid
        // timezone-shifted UTC toISOString() slicing.
        const parsed = new Date(target)
        if (!isNaN(parsed.getTime())) {
          const y = parsed.getFullYear()
          const mo = String(parsed.getMonth() + 1).padStart(2, '0')
          const d  = String(parsed.getDate()).padStart(2, '0')
          sampleDate = `${y}-${mo}-${d}`
        } else {
          sampleDate = target // already ISO or unrecognisable — pass through
        }
      }

      const weekRows       = allRows.filter(r => r[dateCol] === target)
      // Derive the service-template column name from column_map (the entry whose
      // dest_field is "service_template_code"). sm.service_column does not exist —
      // using it directly always produces undefined and collapses every row into "DEFAULT".
      const columnMapArr   = (sm.column_map as any[] | undefined) ?? []
      const serviceColEntry = columnMapArr.find((cm: any) => cm.dest_field === 'service_template_code')
      const serviceCol     = serviceColEntry?.source_column as string | undefined
      const defaultCode    = sm.default_service_template_code as string | undefined

      if (sm.tall_format) {
        // ── TALL FORMAT ──
        // Metrics live in area_field_map keyed by metric_name (+ group_type/context prefix).
        const tf               = sm.tall_format as any
        const metricNameCol    = tf.metric_name_column    as string | undefined
        const groupTypeCol     = tf.group_type_column     as string | undefined
        const groupContextCol  = tf.group_context_column  as string | undefined
        const valueCol         = tf.value_column          as string | undefined
        const areaFieldMap     = (tf.area_field_map ?? {}) as Record<string, string>

        for (const row of weekRows) {
          const serviceCode = (serviceCol ? row[serviceCol] : null) ?? defaultCode ?? 'DEFAULT'

          const rawMetricName   = metricNameCol   ? row[metricNameCol]   : null
          const rawGroupType    = groupTypeCol    ? row[groupTypeCol]    : null
          const rawGroupContext = groupContextCol ? row[groupContextCol] : null

          // Try longest key first, fall back through shorter variants
          const key3 = (rawGroupType && rawGroupContext)
            ? `${rawGroupType} / ${rawGroupContext} / ${rawMetricName ?? ''}` : null
          const key2 = rawGroupType
            ? `${rawGroupType} / ${rawMetricName ?? ''}` : null
          const metricKey = rawMetricName ?? ''

          let destField =
            (key3 ? areaFieldMap[key3] : undefined) ??
            (key2 ? areaFieldMap[key2] : undefined) ??
            (metricKey ? areaFieldMap[metricKey] : undefined)
          if (!destField || destField === 'ignore' || !valueCol) continue

          const rawVal = row[valueCol]
          const numVal = parseFloat(String(rawVal ?? '').replace(/[$,\s]/g, ''))
          if (isNaN(numVal) || numVal === 0) continue

          // TALL format attendance is stored as bare "attendance" in area_field_map.
          // PreviewGrid looks up "attendance.main", "attendance.kids", "attendance.youth".
          // Resolve to the audience-specific field using audience_column + audience_map.
          if (destField === 'attendance') {
            const audienceMapCfg = (tf.audience_map ?? {}) as Record<string, string>
            const audienceCol    = tf.audience_column as string | undefined
            const rawAudience    = audienceCol ? row[audienceCol] : null
            const mappedAudience = rawAudience ? audienceMapCfg[rawAudience] : null
            if (mappedAudience === 'MAIN') {
              destField = 'attendance.main'
            } else if (mappedAudience === 'KIDS') {
              destField = 'attendance.kids'
            } else if (mappedAudience === 'YOUTH') {
              destField = 'attendance.youth'
            } else {
              destField = 'attendance.main' // fallback when audience cannot be resolved
            }
          }

          if (!byTemplate[serviceCode]) byTemplate[serviceCode] = {}
          byTemplate[serviceCode][destField] = (byTemplate[serviceCode][destField] ?? 0) + numVal
        }
      } else {
        // ── WIDE FORMAT ──
        // Metrics are in column_map dest_field entries.
        const columnMap = (sm.column_map as any[] | undefined) ?? []
        const skipFields = new Set(['service_date', 'service_template_code', 'location_code', 'ignore'])

        for (const row of weekRows) {
          const serviceCode = (serviceCol ? row[serviceCol] : null) ?? defaultCode ?? 'DEFAULT'

          for (const cm of columnMap) {
            const destField = cm.dest_field as string
            if (!destField || skipFields.has(destField)) continue

            const rawVal = row[cm.source_column as string]
            if (rawVal == null || rawVal === '') continue
            const numVal = parseFloat(String(rawVal).replace(/[$,\s]/g, ''))
            if (isNaN(numVal) || numVal === 0) continue

            // Giving fields → giving display-name map.
            // Try the direct dest_field→display lookup first (handles AI-generated slugs
            // that differ from the display-name slug), then fall back to slug matching.
            if (destField.startsWith('period_giving.') || destField.startsWith('giving.')) {
              const slug        = destField.replace(/^(period_)?giving\./, '')
              const displayName = destFieldToDisplay[destField] ?? givingSlugToName[slug]
              if (displayName) {
                giving[displayName] = (giving[displayName] ?? 0) + numVal
              }
            } else {
              // Other wide fields (attendance, volunteer, response)
              if (!byTemplate[serviceCode]) byTemplate[serviceCode] = {}
              byTemplate[serviceCode][destField] = (byTemplate[serviceCode][destField] ?? 0) + numVal
            }
          }
        }
      }
    }

    if (!sampleDate) return null
    return { date: sampleDate, by_template: byTemplate, giving }
  } catch {
    return null
  }
}

// Validates the raw propose_mapping output for critical data-loss failures.
// Returns a list of human-readable violation strings (empty = clean).
function validateStageAOutput(mapping: Record<string, unknown>): string[] {
  const violations: string[] = []
  const sources = (mapping.sources as Array<Record<string, unknown>>) ?? []

  // ── IR v2 setup lookups ────────────────────────────────────────────────────
  const setup = (mapping.proposed_setup as Record<string, unknown>) ?? {}
  const metricsArr = (setup.metrics as Array<Record<string, unknown>>) ?? []
  const ministryTagsArr = (setup.ministry_tags as Array<Record<string, unknown>>) ?? []
  const reportingTagsArr = (setup.reporting_tags as Array<Record<string, unknown>>) ?? []

  // The 4 reporting tags pre-seeded at signup — always count as declared.
  const SYSTEM_REPORTING_TAGS = new Set(['ATTENDANCE', 'VOLUNTEERS', 'GIVING', 'RESPONSE_STAT'])

  // metric_code → scope ('instance' | 'period'); also a set of declared codes.
  const metricScopeByCode: Record<string, string> = {}
  const declaredMetricCodes = new Set<string>()
  for (const m of metricsArr) {
    const code = String(m.metric_code ?? '')
    if (!code) continue
    declaredMetricCodes.add(code)
    metricScopeByCode[code] = String(m.scope ?? 'instance')
  }
  const declaredMinistryCodes = new Set(ministryTagsArr.map(t => String(t.code ?? '')).filter(Boolean))
  const declaredReportingCodes = new Set(reportingTagsArr.map(t => String(t.code ?? '')).filter(Boolean))

  // Collect every metric.<CODE> referenced anywhere in the routing (column_map + tall area maps).
  const referencedMetricCodes = new Set<string>()
  const collectMetricRef = (df: string) => {
    if (df.startsWith('metric.')) referencedMetricCodes.add(df.slice('metric.'.length))
  }

  for (const src of sources) {
    const name = String(src.source_name ?? 'unknown source')
    const columnMap = (src.column_map as Array<{ dest_field: string }>) ?? []
    const destFields = columnMap.map(c => String(c.dest_field ?? ''))
    destFields.forEach(collectMetricRef)

    // tall_format.area_field_map values are also metric.<CODE>.
    const areaFieldMap = (src.tall_format as Record<string, unknown> | undefined)?.area_field_map as
      | Record<string, string>
      | undefined
    const areaDestFields = areaFieldMap ? Object.values(areaFieldMap).map(v => String(v ?? '')) : []
    areaDestFields.forEach(collectMetricRef)

    // Failure #2: missing date_column
    const hasDateCol = !!src.date_column || destFields.includes('service_date')
    if (!hasDateCol) {
      violations.push(`Source "${name}" has no date_column — every row will fail with no date to anchor it.`)
    }

    // Failure #3: missing service template anchor on non-period-only sources.
    // A source is "period only" when every routed data dest_field maps to a period-scope metric
    // (instance-vs-period is now read from the metric's scope, not from a period_* prefix).
    const hasTemplateCol = destFields.includes('service_template_code')
    const hasDefaultTemplate = !!src.default_service_template_code
    const allDataDestFields = [...destFields, ...areaDestFields].filter(
      f => f !== 'ignore' && f !== 'service_date' && f !== 'service_template_code' && f !== 'location_code'
    )
    const isPeriodOnly =
      allDataDestFields.length > 0 &&
      allDataDestFields.every(f => {
        if (!f.startsWith('metric.')) return false
        const code = f.slice('metric.'.length)
        return metricScopeByCode[code] === 'period'
      })
    if (!hasTemplateCol && !hasDefaultTemplate && !isPeriodOnly) {
      violations.push(
        `Source "${name}" has no service_template_code column and no default_service_template_code — ` +
        `every data row will fail because there is no service occurrence to attach it to.`
      )
    }
  }

  // Failure (IR v2): a metric.<CODE> dest_field referencing a metric not declared in proposed_setup.metrics.
  for (const code of referencedMetricCodes) {
    if (!declaredMetricCodes.has(code)) {
      violations.push(
        `dest_field "metric.${code}" references a metric that is not declared in proposed_setup.metrics — ` +
        `the row extractor cannot resolve it and every value for this column is lost.`
      )
    }
  }

  // Failure (IR v2): a declared metric referencing an undeclared ministry_tag or reporting_tag.
  // System reporting tags (ATTENDANCE/VOLUNTEERS/GIVING/RESPONSE_STAT) count as declared.
  for (const m of metricsArr) {
    const code = String(m.metric_code ?? 'unknown')
    const ministry = String(m.ministry_tag ?? '')
    const reporting = String(m.reporting_tag ?? '')
    if (ministry && !declaredMinistryCodes.has(ministry)) {
      violations.push(
        `Metric "${code}" references ministry_tag "${ministry}" which is not declared in proposed_setup.ministry_tags.`
      )
    }
    if (reporting && !SYSTEM_REPORTING_TAGS.has(reporting) && !declaredReportingCodes.has(reporting)) {
      violations.push(
        `Metric "${code}" references reporting_tag "${reporting}" which is neither a system tag ` +
        `(ATTENDANCE/VOLUNTEERS/GIVING/RESPONSE_STAT) nor declared in proposed_setup.reporting_tags.`
      )
    }
  }

  // Failure #6: [BLOCKING] display_name with no matching blocking question
  const templates = (setup.service_templates as Array<Record<string, unknown>>) ?? []
  const questions = (mapping.clarification_questions as Array<Record<string, unknown>>) ?? []
  const hasServiceNamesQuestion = questions.some(q => q.id === 'q_service_names' && q.blocking === true)
  const hasBlockingTemplates = templates.some(t => String(t.display_name ?? '').includes('[BLOCKING]'))
  if (hasBlockingTemplates && !hasServiceNamesQuestion) {
    violations.push(
      `One or more service templates have [BLOCKING] display_name but there is no q_service_names blocking question — ` +
      `the user cannot resolve the opaque codes before import.`
    )
  }

  return violations
}

export async function runStageA(args: {
  supabase:     SupabaseClient
  churchId:     string
  sources:      NormalizedSource[]
  sourceInputs: SourceInput[]
  freeText?:    string
  jobId?:       string | null
}): Promise<StageAResult> {
  let totalCents = 0

  // ── Pre-fetch: fetch each source's rows exactly once ────────────────────────
  // These rows are reused for both the Opus pattern read and the preview sample.
  // This guarantees Opus sees every row and the preview uses identical data —
  // no duplicate HTTP requests to Google Sheets.
  const allRowsBySource: Array<Record<string, string>[]> = []
  for (let i = 0; i < args.sources.length; i++) {
    const source      = args.sources[i]
    const sourceInput = args.sourceInputs[i]
    if (!sourceInput || source.error || sourceInput.kind === 'text') {
      allRowsBySource.push([])
      continue
    }
    try {
      allRowsBySource.push(await getAllRows(sourceInput))
    } catch {
      allRowsBySource.push([])
    }
  }

  // Step 1 — Opus reads each source and produces a PatternReport
  const patternReports: Array<{ sourceName: string; report: PatternReport | null }> = []

  for (let i = 0; i < args.sources.length; i++) {
    const source = args.sources[i]
    if (source.error || allRowsBySource[i].length === 0) {
      patternReports.push({ sourceName: source.name, report: null })
      continue
    }

    const { report, totalCents: cents } = await runPatternReader({
      supabase: args.supabase,
      churchId: args.churchId,
      source,
      allRows:  allRowsBySource[i],
      jobId:    args.jobId,
    })
    totalCents += cents
    patternReports.push({ sourceName: source.name, report })
  }

  // Step 2 — Sonnet converts pattern reports into a mapping proposal
  const today = new Date().toISOString().slice(0, 10)
  const userPrompt =
    `Today's date: ${today}. Data up to and including this date is historical, not future.\n\n` +
    `Pattern reports from Opus (one per source):\n` +
    JSON.stringify(patternReports, null, 2) + '\n\n' +
    (args.freeText ? `Additional church description from user:\n${args.freeText}\n\n` : '') +
    `Call propose_mapping exactly once. ` +
    `Use ONLY the service codes, metric values, and audience values that appear in the pattern reports. ` +
    `Do not invent data that was not observed. ` +
    `For preview_data, compute REAL monthly aggregates from the date_range and observed patterns — do NOT emit zeros.`

  const result = await runToolLoop({
    supabase:    args.supabase,
    churchId:    args.churchId,
    kind:        'import_stage_a',
    model:       'claude-sonnet-4-6',
    system:      [{ type: 'text', text: STAGE_A_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools:       [PROPOSE_MAPPING_TOOL],
    handlers:    { propose_mapping: async (input) => input },
    terminateOn: ['propose_mapping'],
    maxTurns:    3,
    jobId:       args.jobId,
    initialUser: userPrompt,
  })
  totalCents += result.totalCents

  let rawMapping = result.finalToolCall?.input ?? null
  if (!rawMapping) {
    return { proposedMapping: null, totalCents }
  }

  // QW-1: Post-Stage-A validation — catches failures #2, #3, #6 before Stage B fires
  const violations = validateStageAOutput(rawMapping)
  if (violations.length > 0) {
    const correctionPrompt =
      `Your propose_mapping call has ${violations.length} critical error(s) that will cause 100% data loss:\n\n` +
      violations.map((v, i) => `${i + 1}. ${v}`).join('\n') +
      `\n\nHere is what you proposed:\n` +
      JSON.stringify(rawMapping, null, 2) +
      `\n\nCall propose_mapping again. Fix ONLY the listed errors. Keep everything else identical.`

    const correction = await runToolLoop({
      supabase:    args.supabase,
      churchId:    args.churchId,
      kind:        'import_stage_a',
      model:       'claude-sonnet-4-6',
      system:      [{ type: 'text', text: STAGE_A_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools:       [PROPOSE_MAPPING_TOOL],
      handlers:    { propose_mapping: async (input) => input },
      terminateOn: ['propose_mapping'],
      maxTurns:    3,
      jobId:       args.jobId,
      initialUser: correctionPrompt,
    })
    totalCents += correction.totalCents
    if (correction.finalToolCall?.input) {
      rawMapping = correction.finalToolCall.input
    }
  }

  // ── Apply-to-data validator (Pass 1+2 deterministic, Pass 3 Haiku, up to 2 iterations) ──
  // This is the contract layer that prevents catastrophic mis-mappings from reaching
  // the user. It applies the proposed mapping to actual sample rows and verifies
  // parent-child claims against the structural data.
  const rowsByName: Record<string, Record<string, string>[]> = {}
  for (let i = 0; i < args.sources.length; i++) {
    rowsByName[args.sources[i].name] = allRowsBySource[i] ?? []
  }

  let workingMapping = rawMapping as {
    sources:        ConfirmedSourceMapping[]
    proposed_setup?: Record<string, unknown>
    clarification_questions?: Array<{ id: string; question: string; blocking: boolean }>
  }
  let accumulatedClarifications: Array<{ id: string; question: string; blocking: boolean }> = []

  for (let iter = 0; iter < 2; iter++) {
    const validation = validateMapping({
      sources:    args.sources,
      rowsByName,
      mapping:    workingMapping as Parameters<typeof validateMapping>[0]['mapping'],
      iteration:  iter,
    })

    if (validation.passed) break
    if (validation.violations.length === 0) break

    // Snapshot questions Sonnet (and any prior iterations) already asked so
    // Haiku doesn't propose duplicates. Without this, Sonnet's "name Service
    // Type 1 and 2" and Haiku's "what are the display names for the 9 AM and
    // 11 AM services" both ended up in the walkthrough as separate questions.
    const existingQuestions = ((rawMapping as { clarification_questions?: Array<{ id?: string; question?: string }> })
      ?.clarification_questions ?? [])
      .concat(accumulatedClarifications)
      .map((q) => ({
        id:       q.id ?? '',
        question: q.question ?? '',
      }))
      .filter(q => q.question.length > 0)

    // Hand violations to Haiku for narrow-lane interpretation
    const { interpretation, totalCents: haikuCents } = await interpretViolations({
      supabase:    args.supabase,
      churchId:    args.churchId,
      violations:  validation.violations,
      description: args.freeText ?? '',
      existingQuestions,
      jobId:       args.jobId,
      mappingDigest: {
        sources: workingMapping.sources.map(s => ({
          source_name: s.source_name,
          column_map:  s.column_map,
          tall_format: s.tall_format,
          default_service_template_code: s.default_service_template_code,
        })),
        proposed_setup_summary: {
          ministry_tags:     (workingMapping.proposed_setup as { ministry_tags?: unknown[] })?.ministry_tags ?? [],
          reporting_tags:    (workingMapping.proposed_setup as { reporting_tags?: unknown[] })?.reporting_tags ?? [],
          service_templates: (workingMapping.proposed_setup as { service_templates?: unknown[] })?.service_templates ?? [],
          metrics:           (workingMapping.proposed_setup as { metrics?: unknown[] })?.metrics ?? [],
        },
      },
    })
    totalCents += haikuCents

    if (!interpretation) break

    // Apply mechanical patches; accumulate clarifications for the user
    const patched = applyPatches(workingMapping as Parameters<typeof applyPatches>[0], interpretation)
    workingMapping = {
      ...workingMapping,
      sources: patched.sources,
    }
    accumulatedClarifications = patched.clarification_questions
  }

  rawMapping = workingMapping

  // Build preview_sample: filter the already-fetched rows to the second-to-last
  // unique date and map through the proposed column_map / area_field_map so
  // PreviewGrid can render real numbers without a second Google Sheets fetch.
  const previewSample = await buildPreviewSample(allRowsBySource, rawMapping)

  // Final dedup pass — even with the prompt-level hint to Haiku, the two LLMs
  // can still produce semantically overlapping questions ("name Service Type 1"
  // vs "what are the display names for 9 AM and 11 AM"). Keep the first
  // occurrence, drop later duplicates.
  const sonnetClarifications = ((rawMapping as { clarification_questions?: Array<{ id?: string; question?: string }> })
    ?.clarification_questions ?? [])
  const finalClarifications = dedupeClarifications([
    ...sonnetClarifications,
    ...accumulatedClarifications,
  ])

  const proposedMapping = {
    ...rawMapping,
    clarification_questions: finalClarifications,
    ...(previewSample ? { preview_sample: previewSample } : {}),
  }

  return { proposedMapping, totalCents }
}
