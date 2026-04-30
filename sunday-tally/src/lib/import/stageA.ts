import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, assertBudget, runToolLoop } from '@/lib/ai/anthropic'
import { recordUsage } from '@/lib/ai/budget'
import type { NormalizedSource, SourceInput } from './sources'
import { runPatternReader, type PatternReport } from './stageA_pattern'
import { generatePatternQuestions } from './pattern_questions'

// ── Sonnet v2 System Prompt (Decision Maker — 9 framework rules) ──────────────

const STAGE_A_SYSTEM = `You are the Decision Maker stage of SundayTally's AI onboarding pipeline.

You receive a PatternReport from the Pattern Reader (Opus) and produce ONE propose_mapping call covering:
- setup entities (locations, service templates, volunteer categories, response categories, giving sources)
- column routing (how each metric maps to a SundayTally destination)
- clarification questions for the user

You do NOT read the raw data. The PatternReport contains everything you need.

Sunday Tally stores weekly church data per service occurrence:
- attendance_entries: headcount by audience (MAIN, KIDS, YOUTH only)
- response_entries: stat counts per category × optional audience
- volunteer_entries: volunteer counts per category × audience
- giving_entries: dollar amounts per giving source

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

RULE 4 — TAGS ARE FIRST-CLASS
Every service template must have: primary_tag AND primary_tag_reasoning.
Valid primary tags — choose the best fit:
  Time-based:     MORNING · EVENING · MIDWEEK · WEEKEND
  Audience-based: MAIN (primary adult congregation) · KIDS (dedicated children's service) · YOUTH (dedicated student service)
  Custom:         any recurring distinct service not covered above (e.g. "SPANISH", "OVERFLOW", "DRIVE_IN")
Use an audience-based tag (MAIN/KIDS/YOUTH) when the service is dedicated entirely to one audience type —
every attendee is kids, or every attendee is adults. Use a time-based tag when the service is blended
(adults, kids, and youth all attend the same occurrence and are tracked together).
If the data doesn't clearly justify a tag → mark display_name as [BLOCKING] and add a blocking question.

RULE 5 — TAGS MUST BE EARNED
Only propose a distinct primary_tag when:
  (a) it applies to a recurring set of occurrences (not one-offs)
  (b) it meaningfully distinguishes from other services (different time, audience, or format)
  (c) it would produce a dashboard row the church actually wants to see
If two services have identical patterns → same tag. Don't manufacture distinctions.

RULE 6 — NO SUBTAGS IN V1
Do NOT propose subtags or subtag questions. Subtag config is deferred to a post-onboarding feature.

RULE 7 — DATE-DERIVABLE PATTERNS ARE NOT TAGS
Never propose: JANUARY, FEBRUARY, SUMMER, WINTER, FIRST_SUNDAY, LAST_SUNDAY, 2024, 2025.
The dashboard query layer computes these from service_date. A tag for them adds nothing.

RULE 8 — CONSISTENT QUESTION FORMAT
Every question uses the same structured format regardless of how the UI delivers it.

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

1. Map observed_metrics → area_field_map (ALL metrics, not just sample):

   ATTENDANCE ROUTING — format-dependent (wrong format = silently zero rows):
   Wide format (one row per occurrence, separate column per audience):
     · main / adult headcount column    → "attendance.main"
     · kids / children headcount column → "attendance.kids"
     · youth / student headcount column → "attendance.youth"
     · single attendance column (no audience split) → "attendance.main"
   Tall format (one row per metric, audience resolved via audience_column):
     · any attendance metric row → "attendance"  (bare — audience comes from audience_map)
   CRITICAL: Bare "attendance" is ONLY valid for tall format. In wide format it is silently
   skipped by the row extractor and zero attendance rows will be imported.

   - likely_type="response"   → "response.UPPERCASE_SLUG" (e.g. "response.BAPTISM")
     When the stat is tracked per audience, append the audience:
     "response.SLUG.MAIN" | "response.SLUG.KIDS" | "response.SLUG.YOUTH"
   - likely_type="volunteer"  → "volunteer.UPPERCASE_SLUG" (e.g. "volunteer.HOST_TEAM")
   - likely_type="giving"     → "giving.UPPERCASE_SLUG" — service-tied (per occurrence)
   - likely_type="unknown"    → blocking question + map to "ignore" for now

   GIVING ROUTING — service-tied vs church-wide weekly:
   • "giving.<CODE>"        — Use when giving rows clearly correspond to specific services.
                              Heuristic: rows always carry a service_template_code, OR dates land
                              on the church's service days (e.g. all Sundays).
   • "period_giving.<CODE>" — Use when giving is a CHURCH-WIDE WEEKLY TOTAL not tied to any
                              specific service. The writer auto-snaps the row's date back to the
                              Sunday on or before it (D-056) and stores in church_period_giving.
                              Heuristic: source has ONLY a date column + amount columns (no
                              service_type column AND default_service_template_code is absent),
                              OR dates land on non-service days (Mondays, Tuesdays — typical for
                              deposit/processing dates), OR the user describes it as "weekly
                              offering total" rather than per-service giving.
   When in doubt, ask a blocking clarification_question with two options:
     "These are per-service offerings" / "This is one weekly church-wide total" / "Something else".

   PERIOD RESPONSE ROUTING — stats that are NOT per service occurrence:
   • "period_response.<CODE>"            — church-wide periodic stat. DEFAULT FORM.
                                           stat_scope must be 'week', 'month', or 'day'.
   • "period_response.<CODE>.<TAG_CODE>" — periodic stat scoped to a specific service line.
                                           STRICT RULE: only use this suffix when <TAG_CODE>
                                           matches the primary_tag of an actual service template
                                           you propose in proposed_setup.service_templates.
                                           Do NOT invent tags to express audience meaning.
                                           If the stat is "kids-related" but no KIDS service
                                           template exists, encode it in the CODE name instead:
                                             ✓ "period_response.KIDS_ROOMS_OPEN"   (audience in name)
                                             ✗ "period_response.ROOMS_OPEN.KIDS"   (suffix invents a tag)
                                           Use the suffix form when the church has a real
                                           dedicated service template for that group:
                                             ✓ "period_response.ATTENDANCE.SPANISH"  — Spanish service exists
                                             ✓ "period_response.ROOMS_OPEN.KIDS"     — dedicated KIDS service template exists
                                             ✓ "period_response.SALVATIONS"          — church-wide, no suffix
   The writer snaps the row's date to the Sunday-of-week (or 1st-of-month) and stores in
   church_period_entries. No service_occurrence is created for these rows.
   Heuristic: use period_response when the column value is a weekly/monthly aggregate
   (e.g. "Weekly Guests", "Monthly Rooms Open") — not when a service occurrence clearly produced the number.

1a. NEVER silently ignore a metric. Every metric in observed_metrics MUST appear in
    area_field_map. If you cannot classify it, map it to "ignore" AND add a blocking
    clarification_question asking the user what it represents.

1b. For every entry in ignored_columns from the PatternReport: if the column name
    suggests it could be a stat, volunteer count, or attendance number (e.g. "Rooms Open",
    "Hands", "Parking", "First Time", "Decisions", "Prayer", "Salvations" etc.), add a
    non-blocking clarification_question asking the user if they want to track it, with
    options: "Track it as a stat" / "Track it as a volunteer count" / "Skip it".
    Do NOT silently discard columns with plausibly church-relevant names.

1c. THREE-LEVEL VOLUNTEER BREAKOUT — when volunteer data exists at multiple audience levels:
    Create separate volunteer_categories for each audience group, each with its own
    audience_type ("MAIN", "KIDS", or "YOUTH"). For example, if the sheet has both
    "Main Volunteers" and "Kids Volunteers", create:
      - volunteer_category: name="Main Service Volunteers", audience_type="MAIN"
      - volunteer_category: name="Kids Volunteers", audience_type="KIDS"
    Map each to distinct dest_fields: "volunteer.MAIN_VOLUNTEERS", "volunteer.KIDS_VOLUNTEERS".
    Do NOT collapse multi-audience volunteer data into a single category.

1d. RESPONSE STAT SCOPE — every entry in proposed_setup.response_categories MUST have stat_scope.
    Five values are valid:
    - 'audience'  Tracked separately per MAIN/KIDS/YOUTH, per service occurrence → response_entries.
                  Use when: audience_scoped=true in observed_metrics, OR dest_field uses
                  "response.<CODE>.MAIN/KIDS/YOUTH". Examples: Kids Baptisms, Adult Salvations.
    - 'service'   One number per service occurrence, no audience split → response_entries.
                  Use when: single value per service, no audience column.
                  Examples: Total Prayer Cards, First Time Guests (service-wide), Parking Count.
    - 'week'      Church-wide WEEKLY total, not tied to any service occurrence → church_period_entries.
                  Use when: the column is a weekly aggregate regardless of how many services ran.
                  Examples: Weekly Total Decisions, Weekly Rooms Open (Kids). Dest: period_response.<CODE>
    - 'month'     Church-wide MONTHLY total → church_period_entries.
                  Examples: Monthly First-Time Guests, Monthly Salvations totals.
    - 'day'       Daily stat → church_period_entries (rare — use only when data is clearly daily).
    Rule: if dest_field ends in .MAIN/.KIDS/.YOUTH the category MUST have stat_scope='audience'.
    Rule: if dest_field starts with period_response. the category MUST have stat_scope='week'|'month'|'day'.
    Wrong scope = silent data loss. When uncertain whether a stat is per-occurrence or periodic, ask the church.

2. Use service_type_column.distinct_values EXACTLY for service_code values.
   NEVER add codes not observed in the data.

3. If service_type_column.is_opaque=true → ALWAYS add a BLOCKING question asking the user to name each code.
   type="text", blocking=true, NO recommended_answer, NO guessing.
   CRITICAL: If you set display_name="[BLOCKING]" on any service template, you MUST include a
   clarification_question with id="q_service_names", blocking=true, type="text" that asks the user
   to provide the real name for each opaque code. Setting [BLOCKING] without a question is a bug —
   the user has no way to answer and the import cannot proceed.

4. Use audience_column.proposed_map for tall_format.audience_map.

5. Convert open_questions from PatternReport into clarification_questions. Blockers → blocking=true.

6. For TALL format: include tall_format object with metric_name_column, value_column, audience_column.
   When grouping_columns disambiguate metric meaning (e.g. "Group Type" with values Stats/Volunteers/Attender):
   set group_type_column and use compound keys in area_field_map: "GroupTypeValue / MetricValue".

   Column map dest_field values — use EXACTLY these strings (nothing else):
     "service_date"          — the date column
     "service_template_code" — the service type/code column (NEVER "service_code" — that is wrong)
     "location_code"         — the location column, if present
     "ignore"                — skip this column
   For TALL format, the column_map only needs service_date + service_template_code. All metric
   routing goes through tall_format.area_field_map. Do NOT put "audience", "group", "metric_name",
   "value", or "group_type" in column_map dest_field — those are not valid dest_field values.

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

    EXCEPTION — pure period sources: If EVERY non-meta column in a source maps to
    "period_giving.<CODE>", "period_response.<CODE>", "period_response.<CODE>.<TAG>", or "ignore"
    (no attendance, no per-service giving, no volunteer, no occurrence-based response),
    the source needs NO template. Period rows are written directly to church_period_giving or
    church_period_entries anchored on the Sunday-of-week — no service_occurrence is created.
    For these sources, leave default_service_template_code absent.

7. NULL = "not entered", not zero. Never COALESCE(attendance, 0).

8. BLOCKING questions: NEVER set recommended_answer. Leave it absent.

9. If the same metric (e.g. "Baptism") appears in multiple groups for the same audience → blocking question
   about combining vs separating. type="choice".

DATE COLUMN — always explicitly set date_column on the source to the exact column name that holds the
service date. Never omit it. If date_column is absent and no column_map entry maps to service_date,
Stage B cannot find dates and every single row in the source fails with no clear error to the user.

DEST TABLE — set dest_table accurately:
  'attendance_entries'  source has only attendance columns
  'giving_entries'      source has only giving columns
  'volunteer_entries'   source has only volunteer columns
  'response_entries'    source has only response/stat columns
  'mixed'               source has multiple data types (most common real-world sheet)
  'service_schedule'    source is a calendar/schedule reference with no metric data
  'ignore'              source should not be imported at all

SERVICE TEMPLATE audience_type — set ONLY when every attendee of this service belongs to one audience:
  audience_type="KIDS"  for a dedicated children's service (Kids Church, LifeKids, etc.)
  audience_type="YOUTH" for a dedicated youth or student service
  audience_type="MAIN"  reserved for services that are explicitly adults-only
  Leave absent for any blended service where main + kids + youth share the same occurrence.
  Alignment: a KIDS-tagged service (primary_tag=KIDS) will nearly always have audience_type=KIDS.

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
   - audience_group_code, audience_type → who attends / age group
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
            dest_table: {
              type: 'string',
              enum: ['attendance_entries', 'giving_entries', 'volunteer_entries', 'response_entries', 'service_schedule', 'mixed', 'ignore'],
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
                  dest_field:    { type: 'string' },
                  notes:         { type: 'string' },
                },
                required: ['source_column', 'dest_field'],
              },
            },
            notes: { type: 'string' },
            tall_format: {
              type: 'object',
              properties: {
                metric_name_column: { type: 'string' },
                value_column:       { type: 'string' },
                audience_column:    { type: 'string' },
                group_type_column:  { type: 'string' },
                audience_map:       { type: 'object' },
                area_field_map: {
                  type: 'object',
                  description: 'Maps metric (or "GroupType / Metric") to dest_field. Must cover every observed metric.',
                },
              },
              required: ['metric_name_column', 'value_column'],
            },
          },
          required: ['source_name', 'dest_table', 'column_map'],
        },
      },

      proposed_setup: {
        type: 'object',
        properties: {
          locations: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, code: { type: 'string' } },
              required: ['name'],
            },
          },
          service_templates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                display_name:          { type: 'string' },
                service_code:          { type: 'string' },
                location_name:         { type: 'string' },
                primary_tag:           { type: 'string' },
                primary_tag_reasoning: { type: 'string', description: 'Why this tag is correct for this service. Required.' },
                audience_type:         { type: 'string', enum: ['MAIN', 'KIDS', 'YOUTH'] },
                day_of_week: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 6,
                  description: 'Inferred from observed service_dates: 0=Sun, 1=Mon, ..., 6=Sat. Required.',
                },
                start_time: {
                  type: 'string',
                  description: 'HH:MM 24-hour. NULL if unknown — pair with a blocking q_time_<service_code> question.',
                },
              },
              required: ['display_name', 'service_code', 'primary_tag', 'primary_tag_reasoning', 'day_of_week'],
            },
          },
          response_categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:       { type: 'string' },
                stat_scope: {
                  type: 'string',
                  enum: ['audience', 'service', 'week', 'month', 'day'],
                  description: "'audience'/'service' = per occurrence (response_entries). 'week'/'month'/'day' = periodic aggregate (church_period_entries). Pair 'week'/'month'/'day' with a period_response.<CODE> dest_field.",
                },
              },
              required: ['name', 'stat_scope'],
            },
          },
          giving_sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
          volunteer_categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:          { type: 'string' },
                audience_type: { type: 'string', enum: ['MAIN', 'KIDS', 'YOUTH'] },
              },
              required: ['name'],
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

export async function runStageA(args: {
  supabase:     SupabaseClient
  churchId:     string
  sources:      NormalizedSource[]
  sourceInputs: SourceInput[]
  freeText?:    string
}): Promise<StageAResult> {
  let totalCents = 0

  // Step 1 — Opus reads each source and produces a PatternReport
  const patternReports: Array<{ sourceName: string; report: PatternReport | null }> = []

  for (let i = 0; i < args.sources.length; i++) {
    const source      = args.sources[i]
    const sourceInput = args.sourceInputs[i]
    if (!sourceInput || source.error) {
      patternReports.push({ sourceName: source.name, report: null })
      continue
    }

    const { report, totalCents: cents } = await runPatternReader({
      supabase:    args.supabase,
      churchId:    args.churchId,
      source,
      sourceInput,
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
    initialUser: userPrompt,
  })
  totalCents += result.totalCents

  const rawMapping = result.finalToolCall?.input ?? null
  if (!rawMapping) {
    return { proposedMapping: null, totalCents }
  }

  // V1.5-Δ1 + V1.5-Δ6: Pattern Confirmation Phase.
  // Generate pattern questions deterministically from the PatternReports BEFORE the AI's
  // routing questions. They land at the top of clarification_questions and the confirm UI
  // renders them in a "Verify what we found" section, distinct from the routing questions.
  // See AI_ONBOARDING_STANDARD_V1_5.md §V1.5-Δ1 / Δ6 for design rationale.
  const proposedSetup = rawMapping.proposed_setup as { service_templates?: Array<{ display_name?: string; service_code?: string; primary_tag?: string }> } | undefined
  const patternQuestions = generatePatternQuestions(patternReports, proposedSetup)

  // Guard: if Sonnet set [BLOCKING] display names but forgot the question, synthesize it
  const rawQuestionsRaw = rawMapping.clarification_questions
  const rawQuestions: Record<string, unknown>[] = Array.isArray(rawQuestionsRaw) ? rawQuestionsRaw : []
  // Prepend pattern questions so they're answered first.
  for (const pq of patternQuestions.slice().reverse()) {
    rawQuestions.unshift(pq as unknown as Record<string, unknown>)
  }

  const rawTemplates = (rawMapping.proposed_setup as Record<string, unknown> | null)?.service_templates
  const allTemplates: Record<string, unknown>[] = Array.isArray(rawTemplates) ? rawTemplates : []
  const blockingTemplates: Record<string, unknown>[] = allTemplates.filter(
    t => String((t as Record<string, unknown>).display_name ?? '').includes('[BLOCKING]')
  )
  const hasServiceNamingQ = rawQuestions.some(q => {
    const id = String(q.id ?? '')
    return id === 'q_service_names'
  })
  if (blockingTemplates.length > 0 && !hasServiceNamingQ) {
    const codes = blockingTemplates.map(t => `Code "${t.service_code}"`).join(', ')
    rawQuestions.unshift({
      id: 'q_service_names',
      blocking: true,
      type: 'text',
      title: 'Name your service types',
      context: `Your data uses numeric service codes that need human-readable names. Found ${blockingTemplates.length} unnamed service type${blockingTemplates.length > 1 ? 's' : ''}: ${codes}.`,
      question: `What is the display name for each service code? List one per line, e.g. "Code 1 = 9am Service, Code 2 = 11am Service".`,
      data_examples: blockingTemplates.map(t => `service_code: ${t.service_code}`),
    })
  }

  // Guard: every service_template needs a start_time. Times are never in source data,
  // so the server injects ONE blocking question listing all templates that lack one.
  // Stage A is told NOT to add per-template time questions — this guard owns the contract.
  const templatesNeedingTime = allTemplates.filter(t => {
    const st = (t as Record<string, unknown>).start_time
    return st === undefined || st === null || st === ''
  })
  const hasTimeQuestion = rawQuestions.some(q => {
    const id = String(q.id ?? '')
    return id === 'q_service_times' || id.startsWith('q_time_')
  })
  if (templatesNeedingTime.length > 0 && !hasTimeQuestion) {
    const dayLabels = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
    const lines = templatesNeedingTime.map(t => {
      const dow = (t as Record<string, unknown>).day_of_week
      const day = typeof dow === 'number' && dow >= 0 && dow <= 6 ? dayLabels[dow] : 'unknown day'
      const name = String((t as Record<string, unknown>).display_name ?? (t as Record<string, unknown>).service_code ?? 'Service')
      return `- ${name} (${day})`
    }).join('\n')
    rawQuestions.push({
      id: 'q_service_times',
      blocking: true,
      type: 'text',
      title: 'Service start times',
      context: `Service times aren't carried in the data — only dates. SundayTally needs the start time for each service to project upcoming Sundays and show "scheduled" cards on the services list.`,
      question: `What time does each service start? Use 24-hour format (e.g. 09:00, 18:30). List one per line:\n${lines}`,
      data_examples: templatesNeedingTime.map(t => {
        const name = String((t as Record<string, unknown>).display_name ?? (t as Record<string, unknown>).service_code ?? 'Service')
        return `${name} (service_code: ${(t as Record<string, unknown>).service_code})`
      }),
    })
  }

  // V1-Δ3: Volunteer-audience guard.
  // When a service_template has primary_tag in {YOUTH, KIDS} and a volunteer_category
  // contains a token from that template's display_name BUT the volunteer is tagged
  // audience_type='MAIN', synthesize a blocking clarification asking the user
  // whether the volunteer serves the YOUTH/KIDS audience or actually MAIN.
  // Catches the recurring "adult leaders of youth/kids ministry tagged MAIN" bug.
  const rawVolCats: Array<Record<string, unknown>> = Array.isArray(
    (rawMapping.proposed_setup as Record<string, unknown> | null)?.volunteer_categories
  )
    ? (rawMapping.proposed_setup as Record<string, unknown>).volunteer_categories as Array<Record<string, unknown>>
    : []
  const audienceTaggedTemplates = allTemplates.filter(t =>
    ['YOUTH', 'KIDS'].includes(String((t as Record<string, unknown>).primary_tag ?? '').toUpperCase())
  )
  for (const template of audienceTaggedTemplates) {
    const tplName = String((template as Record<string, unknown>).display_name ?? '').toLowerCase()
    const expectedAudience = String((template as Record<string, unknown>).primary_tag ?? '').toUpperCase()
    if (!tplName) continue
    // Tokenize template name (e.g. "Switch" → ["switch"]; "LifeKids" → ["lifekids"])
    const tplTokens = tplName.split(/\s+/).filter(t => t.length >= 4)
    if (tplTokens.length === 0) continue
    const suspectVols = rawVolCats.filter(v => {
      const volName = String((v as Record<string, unknown>).name ?? '').toLowerCase()
      const volAud = String((v as Record<string, unknown>).audience_type ?? '').toUpperCase()
      const matchesTemplate = tplTokens.some(tk => volName.includes(tk))
      return matchesTemplate && volAud === 'MAIN' && expectedAudience !== 'MAIN'
    })
    if (suspectVols.length === 0) continue
    const existingId = `q_volunteer_audience_${String((template as Record<string, unknown>).service_code ?? '').toLowerCase()}`
    if (rawQuestions.some(q => String(q.id ?? '') === existingId)) continue
    const volNames = suspectVols.map(v => String((v as Record<string, unknown>).name ?? ''))
    const audienceWord = expectedAudience === 'YOUTH' ? 'students/teens' : 'kids'
    rawQuestions.push({
      id: existingId,
      blocking: true,
      type: 'choice',
      topic_group: 'pattern_verification',
      title: `Who do these volunteers actually serve?`,
      context: `Your "${(template as Record<string, unknown>).display_name}" service is for ${audienceWord}, but these volunteers are currently tagged as adults: ${volNames.join(', ')}. We want to make sure we count them under the right audience.`,
      question: `For ${volNames.join(', ')} — who do they primarily serve?`,
      options: [
        {
          label: `They serve the ${audienceWord}`,
          explanation: `Adult leaders running the ${(template as Record<string, unknown>).display_name} ministry — count them under ${audienceWord}.`,
          meaning_code: expectedAudience,
        },
        {
          label: `They serve adults`,
          explanation: `These really are adult-audience volunteers (e.g., they help across the whole church) — keep them tagged as adults.`,
          meaning_code: 'MAIN',
        },
      ],
      data_examples: volNames.map(n => `Volunteer category: ${n} (currently MAIN)`),
    })
  }

  // V1-Δ6: Question quality validator — catch silent ignore violations.
  // Stage A's mapping rule 1a says: "NEVER silently ignore a metric. Every metric in
  // observed_metrics MUST appear in area_field_map. If you cannot classify it, map to
  // 'ignore' AND add a blocking clarification question." Sonnet often violates this:
  // routes a column to ignore without surfacing a question. This guard scans the mapping
  // for ignore dest_fields whose column names suggest valuable data (Hands, Rooms Open,
  // Cars, First Time, Salvations, etc.) and synthesizes a clarification when missing.
  const SUSPECT_KEYWORDS = [
    'hands', 'rooms', 'open', 'first time', 'first-time', 'decision', 'salvation', 'baptism',
    'prayer', 'parking', 'cars', 'count', 'total', 'guest', 'visitor', 'rededicat',
    'commitment', 'response', 'attendance', 'attender', 'volunteer',
  ]
  const sourcesArr: Array<Record<string, unknown>> = Array.isArray(rawMapping.sources)
    ? rawMapping.sources as Array<Record<string, unknown>>
    : []
  const ignoredColumnsSeen = new Set<string>()  // dedupe across sources
  for (const src of sourcesArr) {
    const cm: Array<Record<string, unknown>> = Array.isArray(src.column_map)
      ? src.column_map as Array<Record<string, unknown>>
      : []
    // Wide-format ignore checks
    for (const c of cm) {
      if (String(c.dest_field) !== 'ignore') continue
      const colName = String(c.source_column ?? '').trim()
      if (!colName || ignoredColumnsSeen.has(colName.toLowerCase())) continue
      const lower = colName.toLowerCase()
      const matchedKeyword = SUSPECT_KEYWORDS.find(k => lower.includes(k))
      if (!matchedKeyword) continue
      ignoredColumnsSeen.add(lower)
      // Skip if Stage A already produced a question that mentions this column name.
      const alreadyAsked = rawQuestions.some(q =>
        String(q.context ?? '').toLowerCase().includes(lower) ||
        String(q.question ?? '').toLowerCase().includes(lower) ||
        (Array.isArray(q.data_examples) && q.data_examples.some(e => String(e).toLowerCase().includes(lower)))
      )
      if (alreadyAsked) continue
      const colSlug = colName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
      rawQuestions.push({
        id: `q_track_${colSlug}`,
        blocking: false,
        type: 'choice',
        topic_group: 'pattern_verification',
        title: `What should we do with "${colName}"?`,
        context: `We see a column called "${colName}" in your data but we weren't sure how to track it. We don't want to silently drop it.`,
        question: `How should we handle "${colName}"?`,
        options: [
          {
            label:        `Track as a per-service stat`,
            explanation:  `One value per service occurrence (e.g., counted at each Sunday).`,
            meaning_code: 'STAT_SERVICE',
          },
          {
            label:        `Track as a weekly church-wide stat`,
            explanation:  `One value per week, not tied to any specific service.`,
            meaning_code: 'STAT_WEEK',
          },
          {
            label:        `Track as a volunteer count`,
            explanation:  `Counts the number of people serving in this role.`,
            meaning_code: 'VOLUNTEER',
          },
          {
            label:        `Skip it`,
            explanation:  `This column isn't meaningful to track in SundayTally.`,
            meaning_code: 'SKIP',
          },
        ],
        recommended_answer: 'Skip it',
        data_examples: [`Column header: "${colName}"`, `Detected keyword match: "${matchedKeyword}"`],
      })
    }
    // Tall-format ignore checks (area_field_map values === 'ignore')
    const tallFormat = src.tall_format as Record<string, unknown> | undefined
    if (tallFormat && tallFormat.area_field_map && typeof tallFormat.area_field_map === 'object') {
      const afm = tallFormat.area_field_map as Record<string, string>
      for (const [metricKey, dest] of Object.entries(afm)) {
        if (dest !== 'ignore') continue
        const lower = metricKey.toLowerCase()
        if (ignoredColumnsSeen.has(lower)) continue
        const matchedKeyword = SUSPECT_KEYWORDS.find(k => lower.includes(k))
        if (!matchedKeyword) continue
        ignoredColumnsSeen.add(lower)
        const alreadyAsked = rawQuestions.some(q =>
          String(q.context ?? '').toLowerCase().includes(lower) ||
          String(q.question ?? '').toLowerCase().includes(lower)
        )
        if (alreadyAsked) continue
        const colSlug = metricKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
        rawQuestions.push({
          id: `q_track_${colSlug}`,
          blocking: false,
          type: 'choice',
          topic_group: 'pattern_verification',
          title: `What should we do with "${metricKey}"?`,
          context: `Your data has a metric "${metricKey}" that we weren't sure how to classify. We don't want to silently drop it.`,
          question: `How should we handle "${metricKey}"?`,
          options: [
            { label: 'Track as a per-service stat', explanation: 'One value per service occurrence.', meaning_code: 'STAT_SERVICE' },
            { label: 'Track as a weekly church-wide stat', explanation: 'One value per week, not tied to any service.', meaning_code: 'STAT_WEEK' },
            { label: 'Track as a volunteer count', explanation: 'Counts people serving in this role.', meaning_code: 'VOLUNTEER' },
            { label: 'Skip it', explanation: 'Not meaningful to track in SundayTally.', meaning_code: 'SKIP' },
          ],
          recommended_answer: 'Skip it',
          data_examples: [`Metric: "${metricKey}"`, `Keyword: "${matchedKeyword}"`],
        })
      }
    }
  }

  // Step 3 — Haiku humanizes the question text
  const humanizedQuestions = rawQuestions.length > 0
    ? await runHaikuHumanizer(args.supabase, args.churchId, rawQuestions, totalCents).then(r => {
        totalCents += r.cents
        return r.questions
      }).catch(() => rawQuestions)
    : rawQuestions

  const proposedMapping = {
    ...rawMapping,
    clarification_questions: humanizedQuestions,
  }

  return { proposedMapping, totalCents }
}

// ── Haiku question humanizer ──────────────────────────────────────────────────

async function runHaikuHumanizer(
  supabase:     SupabaseClient,
  churchId:     string,
  questions:    unknown[],
  _spentSoFar:  number,
): Promise<{ questions: unknown[]; cents: number }> {
  await assertBudget(supabase, churchId, 'import_stage_a')

  const response = await anthropic().messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system:     HAIKU_HUMANIZER_SYSTEM,
    messages: [{
      role:    'user',
      content: JSON.stringify({ questions }, null, 2),
    }],
  })

  const { cents } = await recordUsage(supabase, churchId, 'import_stage_a', 'claude-haiku-4-5-20251001', {
    input:       response.usage.input_tokens                  ?? 0,
    output:      response.usage.output_tokens                 ?? 0,
    cacheRead:   response.usage.cache_read_input_tokens       ?? 0,
    cacheCreate: response.usage.cache_creation_input_tokens   ?? 0,
  })

  const text = response.content.find(b => b.type === 'text')?.text ?? ''
  try {
    // Haiku may or may not wrap in ```json fences
    const clean  = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(clean) as { questions?: unknown[] }
    if (parsed.questions && Array.isArray(parsed.questions)) {
      return { questions: parsed.questions, cents }
    }
  } catch {
    // fall through — return original
  }
  return { questions, cents }
}
