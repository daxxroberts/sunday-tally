# Church Analytics — Dashboard Query Patterns
## Version 1.0 | Required reading before writing any dashboard query

This document exists because the schema has several design decisions that are
not obvious from table structure alone. Developers who skip this file will
produce inconsistent dashboard numbers. Read it once before writing any query.

---

## Critical Rules — Apply to Every Query

**Rule 1: Always filter cancelled occurrences from metrics.**
```sql
WHERE so.status = 'active'
-- Never omit this. Cancelled services show as zeroes, which skews averages
-- and trends. A cancelled Easter service showing 0 attendance corrupts
-- every week-over-week comparison that includes it.
```

**Rule 2: Cross-location rollup uses display_name, not template ID.**
```sql
-- WRONG — returns one service per location, never combines them
GROUP BY st.id

-- CORRECT — combines "Service 1" across all campuses
GROUP BY st.display_name
-- Document this in every cross-location query as a comment.
```

**Rule 3: Volunteer totals are always calculated, never stored.**
```sql
-- There is no "total volunteers" column. Sum from volunteer_entries rows.
-- Filter is_not_applicable = false before summing.
-- A missing row (no data entered) ≠ zero. Treat missing rows as NULL in UI.
```

**Rule 4: NULL attendance ≠ zero attendance.**
```sql
-- NULL on main_attendance means the field was not entered.
-- 0 means zero people attended.
-- Use COALESCE only when the UI explicitly shows "no data" vs "0".
-- Never COALESCE to 0 in average calculations — it corrupts the average.
```

**Rule 5: Giving entries allow multiple rows per occurrence.**
```sql
-- A church may enter a total, then add a delayed online giving row later.
-- Always SUM giving_entries — never assume one row per occurrence.
-- In V1, giving_type = 'total' for all entries. Filter or not as needed.
```

---

## Pattern Library

### P1 — Weekly Attendance Summary (single church)

```sql
SELECT
  so.service_date,
  st.display_name        AS service_name,
  cl.name                AS location_name,
  ae.main_attendance,
  ae.kids_attendance,
  ae.youth_attendance,
  COALESCE(ae.main_attendance, 0)
    + COALESCE(ae.kids_attendance, 0)
    + COALESCE(ae.youth_attendance, 0) AS total_attendance
FROM service_occurrences so
JOIN service_templates   st ON so.service_template_id = st.id
JOIN church_locations    cl ON so.location_id = cl.id
LEFT JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
WHERE so.church_id = $1          -- always scope to one church
  AND so.status = 'active'       -- Rule 1: exclude cancelled
  AND so.service_date BETWEEN $2 AND $3
ORDER BY so.service_date DESC, st.sort_order;
```

**Why LEFT JOIN on attendance_entries:** An occurrence may exist without
an attendance record if data hasn't been entered yet. LEFT JOIN surfaces
those gaps in the UI so the admin knows what's missing.

---

### P2 — Service Trend (single service template over time)

```sql
SELECT
  so.service_date,
  ae.main_attendance,
  ae.kids_attendance,
  ae.youth_attendance
FROM service_occurrences so
LEFT JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
WHERE so.service_template_id = $1   -- one service identity
  AND so.status = 'active'          -- Rule 1
  AND so.service_date >= $2
ORDER BY so.service_date ASC;
```

**Use case:** "Show me how Service 1 has trended over the past 12 months."
The service_template_id is stable even if the service time changes — this
is exactly why service_templates exist as a separate identity layer.

---

### P3 — Cross-Location Rollup (same service name across campuses)

```sql
SELECT
  so.service_date,
  st.display_name                     AS service_name,
  cl.name                             AS location_name,
  ae.main_attendance,
  SUM(ae.main_attendance) OVER (
    PARTITION BY so.service_date, st.display_name
  )                                   AS combined_main_attendance
FROM service_occurrences so
JOIN service_templates   st ON so.service_template_id = st.id
JOIN church_locations    cl ON so.location_id = cl.id
LEFT JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
WHERE so.church_id = $1
  AND so.status = 'active'            -- Rule 1
  AND st.display_name = $2            -- Rule 2: join by name, not ID
  AND so.service_date BETWEEN $3 AND $4
ORDER BY so.service_date DESC, cl.name;
```

**Critical:** The `display_name` parameter ($2) must match exactly across
all locations (e.g., both must be named "Service 1", not "Service 1" and
"Sunday Service 1"). Enforce consistent naming in the setup UI.

---

### P4 — Volunteer Totals by Audience Group

```sql
SELECT
  vc.audience_group_code,
  SUM(ve.volunteer_count)  AS total_volunteers
FROM volunteer_entries ve
JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
JOIN service_occurrences  so ON ve.service_occurrence_id = so.id
WHERE so.service_occurrence_id = $1   -- one occurrence
  AND ve.is_not_applicable = false    -- Rule 3: exclude N/A rows
GROUP BY vc.audience_group_code
ORDER BY vc.audience_group_code;
```

**Returns:** One row per audience group (MAIN, KIDS, YOUTH) with the
summed volunteer count. This is the number that appears in the dashboard
summary card — not a stored column.

---

### P5 — Volunteer Subcategory Breakdown

```sql
SELECT
  vc.audience_group_code,
  vc.category_name,
  ve.volunteer_count,
  ve.is_not_applicable
FROM volunteer_entries ve
JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
WHERE ve.service_occurrence_id = $1
ORDER BY vc.audience_group_code, vc.sort_order;
```

**Use case:** The drill-down view showing Music: 8, Parking: 4, Greeters: 6
under the MAIN total. Include `is_not_applicable` in the result so the UI
can render "N/A" instead of "0" for non-applicable categories.

---

### P6 — Weekly Giving Total

```sql
SELECT
  so.service_date,
  SUM(ge.giving_amount)  AS total_giving,
  COUNT(ge.id)           AS entry_count   -- >1 means delayed giving was added
FROM service_occurrences so
LEFT JOIN giving_entries ge ON ge.service_occurrence_id = so.id
WHERE so.church_id = $1
  AND so.status = 'active'               -- Rule 1
  AND so.service_date BETWEEN $2 AND $3
GROUP BY so.service_date, so.id
ORDER BY so.service_date DESC;
```

**Rule 5 in practice:** SUM handles multiple giving rows per occurrence
automatically. The `entry_count` column is useful for admins to see
when delayed giving was added — an `entry_count > 1` means the record
was updated after initial submission.

---

### P7 — Giving Per Attendee

```sql
SELECT
  so.service_date,
  st.display_name                                         AS service_name,
  SUM(ge.giving_amount)                                   AS total_giving,
  ae.main_attendance,
  CASE
    WHEN ae.main_attendance > 0
    THEN ROUND(SUM(ge.giving_amount) / ae.main_attendance, 2)
    ELSE NULL
  END                                                     AS giving_per_attendee
FROM service_occurrences so
JOIN service_templates   st ON so.service_template_id = st.id
LEFT JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
LEFT JOIN giving_entries  ge ON ge.service_occurrence_id = so.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date BETWEEN $2 AND $3
GROUP BY so.service_date, so.id, st.display_name, ae.main_attendance
ORDER BY so.service_date DESC;
```

**Division guard:** The CASE prevents division by zero when attendance
is 0 or NULL. Return NULL (not 0) — the UI should show "—" not "$0.00"
when giving per attendee cannot be calculated.

---

### P8 — Volunteer-to-Attendee Ratio

```sql
SELECT
  so.service_date,
  ae.main_attendance,
  SUM(CASE WHEN vc.audience_group_code = 'MAIN' AND ve.is_not_applicable = false
           THEN ve.volunteer_count ELSE 0 END)  AS main_volunteers,
  CASE
    WHEN ae.main_attendance > 0
    THEN ROUND(
      SUM(CASE WHEN vc.audience_group_code = 'MAIN' AND ve.is_not_applicable = false
               THEN ve.volunteer_count ELSE 0 END)::numeric
      / ae.main_attendance, 3)
    ELSE NULL
  END                                           AS volunteer_ratio
FROM service_occurrences so
LEFT JOIN attendance_entries ae  ON ae.service_occurrence_id = so.id
LEFT JOIN volunteer_entries  ve  ON ve.service_occurrence_id = so.id
LEFT JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date BETWEEN $2 AND $3
GROUP BY so.service_date, so.id, ae.main_attendance
ORDER BY so.service_date DESC;
```

**Interpretation:** A ratio of 0.125 means 1 volunteer per 8 attendees.
Display as "1:8" in the UI for readability.

---

## Weekly Giving — Entered as Single Total Across Multiple Services

Some churches track giving weekly, not per service. They will enter giving
on one occurrence and leave the others blank. This is valid behavior —
the schema supports it via multiple rows and per-occurrence entry.

**Dashboard implication:** When calculating weekly giving totals, sum
across ALL occurrences in a given week for a given church:

```sql
SELECT
  DATE_TRUNC('week', so.service_date)  AS week_start,
  SUM(ge.giving_amount)                AS weekly_total
FROM service_occurrences so
JOIN giving_entries ge ON ge.service_occurrence_id = so.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date >= $2
GROUP BY DATE_TRUNC('week', so.service_date)
ORDER BY week_start DESC;
```

This query correctly handles both patterns:
- Church A: giving entered on all three Sunday services → summed correctly
- Church B: giving entered on Service 1 only → one row contributes, others
  have no giving_entries rows, sum is still correct

No special handling needed. The LEFT JOIN + SUM pattern is inherently
compatible with both entry behaviors.

---

## Index Reference

These indexes exist on the schema. Use the indexed columns in WHERE clauses.
Filtering on non-indexed columns forces full table scans as the dataset grows.

| Index | Table | Columns | Use for |
|---|---|---|---|
| idx_service_occurrences_church_date | service_occurrences | church_id, service_date | All dashboard queries |
| idx_service_occurrences_template_date | service_occurrences | service_template_id, service_date | Service trend queries |
| idx_service_templates_church | service_templates | church_id, is_active | Setup and template lookups |
| idx_memberships_user_active | church_memberships | user_id, is_active | RLS helper (automatic) |
| idx_invites_token | church_invites | token | Invite acceptance flow |
| idx_invites_email_status | church_invites | email, status | Admin pending invites view |
| idx_giving_occurrence | giving_entries | service_occurrence_id | Giving lookups per occurrence |

---

## Response Tracking (Salvations)

Response types are audience-grouped and church-configurable — same pattern
as volunteers. The same query rules apply: totals are always calculated,
is_not_applicable distinguishes N/A from zero, missing rows mean not entered.

### P9 — Response Totals by Audience Group (per occurrence)

```sql
SELECT
  rc.audience_group_code,
  rc.response_type_name,
  re.response_count,
  re.is_not_applicable
FROM response_entries re
JOIN response_categories rc ON re.response_category_id = rc.id
WHERE re.service_occurrence_id = $1
  AND re.is_not_applicable = false
ORDER BY rc.audience_group_code, rc.sort_order;
```

### P10 — Response Trend Over Time (single type, single church)

```sql
SELECT
  so.service_date,
  rc.audience_group_code,
  rc.response_type_name,
  re.response_count
FROM service_occurrences so
JOIN response_entries    re ON re.service_occurrence_id = so.id
JOIN response_categories rc ON re.response_category_id = rc.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND rc.response_type_code = $2    -- e.g. 'FIRST_TIME_DECISION'
  AND so.service_date >= $3
ORDER BY so.service_date ASC, rc.audience_group_code;
```

### P11 — Total Salvations per Service (all types combined)

```sql
SELECT
  so.service_date,
  st.display_name          AS service_name,
  SUM(re.response_count)   AS total_responses
FROM service_occurrences so
JOIN service_templates   st ON so.service_template_id = st.id
JOIN response_entries    re ON re.service_occurrence_id = so.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND re.is_not_applicable = false
  AND so.service_date BETWEEN $2 AND $3
GROUP BY so.service_date, so.id, st.display_name
ORDER BY so.service_date DESC;
```

**Index note:** `idx_response_entries_occurrence` covers the join from
response_entries to service_occurrences. Filtering by church_id on the
occurrence side uses the existing `idx_service_occurrences_church_date`.

---

## T1 Screen Queries (Recent Services List)

### P12 — Recent Services with Completion Status (T1 primary query)

```sql
SELECT
  so.id                       AS occurrence_id,
  so.service_date,
  so.status,
  st.display_name             AS service_name,
  st.sort_order,
  cl.name                     AS location_name,
  sv.start_time,
  EXISTS(
    SELECT 1 FROM attendance_entries ae
    WHERE ae.service_occurrence_id = so.id
  )                           AS attendance_entered,
  EXISTS(
    SELECT 1 FROM volunteer_entries ve
    WHERE ve.service_occurrence_id = so.id
  )                           AS volunteers_entered,
  EXISTS(
    SELECT 1 FROM response_entries re
    WHERE re.service_occurrence_id = so.id
  )                           AS responses_entered,
  EXISTS(
    SELECT 1 FROM giving_entries ge
    WHERE ge.service_occurrence_id = so.id
  )                           AS giving_entered
FROM service_occurrences so
JOIN service_templates   st ON so.service_template_id = st.id
JOIN church_locations    cl ON so.location_id = cl.id
LEFT JOIN service_schedule_versions sv
  ON sv.service_template_id = st.id
  AND sv.effective_start_date <= so.service_date
  AND (sv.effective_end_date IS NULL OR sv.effective_end_date >= so.service_date)
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date >= (CURRENT_DATE - INTERVAL '7 days')
  AND so.service_date <= CURRENT_DATE
ORDER BY
  (
    EXISTS(SELECT 1 FROM attendance_entries WHERE service_occurrence_id = so.id) AND
    EXISTS(SELECT 1 FROM volunteer_entries WHERE service_occurrence_id = so.id) AND
    EXISTS(SELECT 1 FROM response_entries WHERE service_occurrence_id = so.id)
  ) ASC,
  so.service_date DESC,
  st.sort_order ASC;
```

**Sort logic:** incomplete services first, then most recent date, then service order within a day.
**Rule 1 applies:** status = 'active' filter excludes cancelled occurrences from the list.

### P12b — Scheduled Services Without an Occurrence Yet

```sql
SELECT
  st.id                   AS template_id,
  st.display_name         AS service_name,
  st.sort_order,
  cl.name                 AS location_name,
  sv.start_time,
  CURRENT_DATE - (
    (EXTRACT(DOW FROM CURRENT_DATE)::int - sv.day_of_week + 7) % 7
  ) * INTERVAL '1 day'   AS expected_service_date
FROM service_templates st
JOIN church_locations    cl ON st.location_id = cl.id
JOIN service_schedule_versions sv
  ON sv.service_template_id = st.id
  AND sv.is_active = true
  AND sv.effective_start_date <= CURRENT_DATE
  AND (sv.effective_end_date IS NULL OR sv.effective_end_date >= CURRENT_DATE)
WHERE st.church_id = $1
  AND st.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM service_occurrences so
    WHERE so.service_template_id = st.id
    AND so.service_date = (
      CURRENT_DATE - (
        (EXTRACT(DOW FROM CURRENT_DATE)::int - sv.day_of_week + 7) % 7
      ) * INTERVAL '1 day'
    )
  );
```

**Use:** Surfaces scheduled services that haven't been started yet.
Combine with P12 results in application layer — P12 returns existing occurrences, P12b returns "not yet started" cards.

---

## Tracking Flags (D-025)

Before evaluating completion status in P12 or rendering sections in T1b/T2–T5,
check church tracking flags. A church that has opted out of a module should
never see that module's section as "incomplete."

```sql
-- Get church tracking configuration
SELECT tracks_volunteers, tracks_responses, tracks_giving
FROM churches
WHERE id = $1;
```

**Updated P12 completion logic — apply tracking flags:**
Application layer combines P12 EXISTS results with tracking flags:

```javascript
const isComplete = (occurrence, church) => {
  const attendanceOk = occurrence.attendance_entered
  const volunteersOk = !church.tracks_volunteers || occurrence.volunteers_entered
  const responsesOk  = !church.tracks_responses  || occurrence.responses_entered
  const givingOk     = !church.tracks_giving     || occurrence.giving_entered
  return attendanceOk && volunteersOk && responsesOk && givingOk
}
```

Attendance is always required (no flag). Each optional module
is skipped in completion check when its flag is false.

---

## P12b Known Limitation

**Bi-weekly and monthly services:** P12b calculates expected_service_date
using day-of-week arithmetic, assuming weekly cadence. A church with a
service that meets every other Sunday or the first Sunday of the month
will see incorrect "not started" cards on off-weeks.

V1 limitation — service_schedule_versions has no recurrence field.
Fix requires schema change. Acceptable for V1 given typical church structure.
Workaround: Admin can ignore incorrect cards — tapping one that shouldn't
exist will show an empty occurrence creation form which they can cancel.

---

### P13 — Occurrence Section Summaries (T1b screen)

Single round trip. Returns all four section summaries for the occurrence dashboard.

```sql
SELECT
  ae.main_attendance,
  ae.kids_attendance,
  ae.youth_attendance,
  (SELECT SUM(ve.volunteer_count)
   FROM volunteer_entries ve
   JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
   WHERE ve.service_occurrence_id = $1
     AND ve.is_not_applicable = false)      AS total_volunteers,
  (SELECT COUNT(DISTINCT vc.audience_group_code)
   FROM volunteer_entries ve
   JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
   WHERE ve.service_occurrence_id = $1
     AND ve.is_not_applicable = false
     AND ve.volunteer_count > 0)            AS active_groups,
  (SELECT SUM(re.response_count)
   FROM response_entries re
   WHERE re.service_occurrence_id = $1
     AND re.is_not_applicable = false)      AS total_responses,
  (SELECT SUM(ge.giving_amount)
   FROM giving_entries ge
   WHERE ge.service_occurrence_id = $1)    AS total_giving
FROM service_occurrences so
LEFT JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
WHERE so.id = $1;
```

**Use:** T1b occurrence dashboard — E3c section summaries.
**Note:** Apply tracks_* flags in application layer before rendering
volunteer/response/giving rows. Do not render untracked sections.

---

## Dashboard Comparison Queries (D-033)

Three comparison modes. User toggles between them. Default: mode 1.

### P14a — This Week vs Last Week

```sql
SELECT
  SUM(CASE WHEN so.service_date >= date_trunc('week', CURRENT_DATE)
           THEN ae.main_attendance + COALESCE(ae.kids_attendance,0) + COALESCE(ae.youth_attendance,0)
           END) AS this_week,
  SUM(CASE WHEN so.service_date >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days'
            AND so.service_date <  date_trunc('week', CURRENT_DATE)
           THEN ae.main_attendance + COALESCE(ae.kids_attendance,0) + COALESCE(ae.youth_attendance,0)
           END) AS last_week
FROM service_occurrences so
JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days';
```

### P14b — Rolling 4-Week Average vs Prior 4-Week Average

```sql
SELECT
  AVG(weekly.total) FILTER (WHERE weekly.week_start >= date_trunc('week', CURRENT_DATE) - INTERVAL '28 days')
    AS current_4wk_avg,
  AVG(weekly.total) FILTER (WHERE weekly.week_start >= date_trunc('week', CURRENT_DATE) - INTERVAL '56 days'
                                AND weekly.week_start <  date_trunc('week', CURRENT_DATE) - INTERVAL '28 days')
    AS prior_4wk_avg
FROM (
  SELECT
    date_trunc('week', so.service_date) AS week_start,
    SUM(ae.main_attendance + COALESCE(ae.kids_attendance,0) + COALESCE(ae.youth_attendance,0)) AS total
  FROM service_occurrences so
  JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
  WHERE so.church_id = $1
    AND so.status = 'active'
    AND so.service_date >= date_trunc('week', CURRENT_DATE) - INTERVAL '56 days'
  GROUP BY date_trunc('week', so.service_date)
) weekly;
```

### P14c — YTD Average vs Last Year YTD Average

```sql
SELECT
  -- This year: average weekly attendance from Jan 1 to today
  AVG(weekly.total) FILTER (
    WHERE weekly.week_start >= date_trunc('year', CURRENT_DATE)
      AND weekly.week_start <= date_trunc('week', CURRENT_DATE)
  ) AS ytd_avg,
  -- Last year: average weekly attendance from Jan 1 to same week last year
  AVG(weekly.total) FILTER (
    WHERE weekly.week_start >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
      AND weekly.week_start <= date_trunc('week', CURRENT_DATE) - INTERVAL '1 year'
  ) AS prior_ytd_avg
FROM (
  SELECT
    date_trunc('week', so.service_date) AS week_start,
    SUM(ae.main_attendance + COALESCE(ae.kids_attendance,0) + COALESCE(ae.youth_attendance,0)) AS total
  FROM service_occurrences so
  JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
  WHERE so.church_id = $1
    AND so.status = 'active'
    AND so.service_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
  GROUP BY date_trunc('week', so.service_date)
) weekly;
```

**Notes on all three:**
- Apply tracks_kids_attendance and tracks_youth_attendance flags before summing
  (exclude NULL fields for churches that don't track those audiences)
- Replace attendance aggregation with same pattern for volunteers, responses, giving
  to produce comparison cards for each tracked metric
- Delta calculation in application layer: ((current - prior) / prior) * 100
- Display: side-by-side numbers with ▲/▼ + percentage delta (D-033)
- Default view: P14a (this week vs last week)
- Toggle order: P14a → P14b → P14c

**Denominator note on P14c:**
YTD average = total attendance / number of weeks with at least one service.
Do not divide by calendar weeks — a church that took 2 weeks off for Christmas
should not have those weeks penalise their average.

```sql
-- Correct denominator: count weeks that had at least one active occurrence
SELECT COUNT(DISTINCT date_trunc('week', so.service_date))
FROM service_occurrences so
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date >= date_trunc('year', CURRENT_DATE);
```

---

## D1 v2.0 Four-Column Dashboard (D-033 revised · D-053 · D-055)

D1 v2.0 replaces the paired `current / prior` cell layout with four explicit time columns:
Col 1 Current Week · Col 2 Last 4-Wk Avg · Col 3 Current YTD Avg · Col 4 Prior YTD Avg.
Col 1 = P14a numerator only · Col 2 = P14b `current_4wk_avg` · Col 3 = P14c `ytd_avg` · Col 4 = new P14d (below).

Deltas: `((Col1 - Col2) / Col2) × 100` and `((Col3 - Col4) / Col4) × 100`. Never between Col2↔Col3.

All four columns are assembled church-wide — no tag GROUP BY at the top level (D-041 revised). Tags reappear only in P14g Other Stats output.

### P14d — Prior YTD Avg (same-window last year)

```sql
SELECT
  AVG(weekly.total) FILTER (
    WHERE weekly.week_start >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
      AND weekly.week_start <= date_trunc('week', CURRENT_DATE) - INTERVAL '1 year'
  ) AS prior_ytd_avg
FROM (
  SELECT
    date_trunc('week', so.service_date) AS week_start,
    SUM(ae.main_attendance + COALESCE(ae.kids_attendance,0) + COALESCE(ae.youth_attendance,0)) AS total
  FROM service_occurrences so
  JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
  WHERE so.church_id = $1
    AND so.status = 'active'                                   -- Rule 1
    AND so.service_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
    AND so.service_date <= date_trunc('week', CURRENT_DATE) - INTERVAL '1 year'
  GROUP BY date_trunc('week', so.service_date)
) weekly;
```

**Denominator (D-055):** weeks-with-occurrences in the prior year, up to the ISO-week matching today's position. Identical logic to N72 / P14c, applied one year back.

**Swap-in:** for volunteers / giving / first-time decisions, replace the inner SUM with the same pattern used in P14a/b/c for that metric. Keep NULL ≠ zero discipline (Rule 4) — don't COALESCE fields into averages.

### P14e — Per-Audience Weekly Totals (Adults · Kids · Youth sections)

Drives E4/E5/E6 attendance rows. One query per audience — field change only.

```sql
-- Adults (MAIN). Swap ae.main_attendance for ae.kids_attendance / ae.youth_attendance.
SELECT
  date_trunc('week', so.service_date) AS week_start,
  SUM(ae.main_attendance) FILTER (WHERE ae.main_attendance IS NOT NULL) AS audience_total
FROM service_occurrences so
JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
WHERE so.church_id = $1
  AND so.status = 'active'                                     -- Rule 1
  AND so.service_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
GROUP BY date_trunc('week', so.service_date)
ORDER BY week_start;
```

Application layer filters the returned rows into four buckets (Current Week / Last 4-Wk / Current YTD / Prior YTD) and averages Col2/3/4.

**NULL ≠ zero (Rule 4):** `FILTER (WHERE ae.main_attendance IS NOT NULL)` keeps NULL fields out of the sum. A NULL audience is "not entered," not "zero people," and must not drag the average down.

### P14e (audience volunteers variant)

```sql
-- Per-audience volunteer total per week (Adults / Kids / Youth volunteer row inside each section).
-- Change $2 to 'MAIN' | 'KIDS' | 'YOUTH'.
SELECT
  date_trunc('week', so.service_date) AS week_start,
  SUM(ve.volunteer_count)             AS audience_volunteer_total
FROM service_occurrences so
JOIN volunteer_entries  ve ON ve.service_occurrence_id = so.id
JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND vc.audience_group_code = $2
  AND ve.is_not_applicable = false                             -- Rule 3
  AND so.service_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
GROUP BY date_trunc('week', so.service_date)
ORDER BY week_start;
```

### P14e (audience stats variant — audience-scope response_categories)

```sql
-- Per-audience, per-category stat total per week.
-- Row per (audience, category). Feeds the stats rows inside Adults/Kids/Youth sections.
SELECT
  date_trunc('week', so.service_date) AS week_start,
  rc.id                               AS category_id,
  rc.category_code,
  rc.category_name,
  re.audience_group_code,
  SUM(re.stat_value) FILTER (WHERE re.is_not_applicable = false) AS weekly_total
FROM service_occurrences so
JOIN response_entries re ON re.service_occurrence_id = so.id
JOIN response_categories rc ON rc.id = re.response_category_id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND rc.is_active = true
  AND rc.stat_scope = 'audience'                               -- only audience-scope stats
  AND so.service_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
GROUP BY date_trunc('week', so.service_date), rc.id, rc.category_code, rc.category_name, re.audience_group_code
ORDER BY week_start, rc.display_order, re.audience_group_code;
```

### P14f — Volunteer Breakout (E7)

```sql
-- One row per (category_id) per week. Application layer sorts by audience then sort_order.
SELECT
  date_trunc('week', so.service_date) AS week_start,
  vc.id                               AS category_id,
  vc.category_name,
  vc.audience_group_code,
  vc.sort_order,
  SUM(ve.volunteer_count)             AS weekly_total
FROM service_occurrences so
JOIN volunteer_entries  ve ON ve.service_occurrence_id = so.id
JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND vc.is_active = true
  AND ve.is_not_applicable = false                             -- Rule 3
  AND so.service_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
GROUP BY date_trunc('week', so.service_date), vc.id, vc.category_name, vc.audience_group_code, vc.sort_order
ORDER BY week_start, vc.audience_group_code, vc.sort_order;
```

The Volunteer Breakout Total row is the outer SUM of all categories per week — computed in the application layer from the same rowset.

### P14g — Other Stats (E8 — service-scope + church_period_entries)

Two sub-queries UNION'd in the application layer. Service-scope stats have no tag (single value per occurrence); period entries are tag-keyed.

```sql
-- Sub-query A: service-scope response_entries weekly totals
SELECT
  date_trunc('week', so.service_date) AS week_start,
  rc.id                               AS category_id,
  rc.category_name,
  NULL::text                          AS tag_code,            -- no tag label on service-scope stats
  SUM(re.stat_value) FILTER (WHERE re.is_not_applicable = false) AS weekly_total
FROM service_occurrences so
JOIN response_entries re ON re.service_occurrence_id = so.id
JOIN response_categories rc ON rc.id = re.response_category_id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND rc.is_active = true
  AND rc.stat_scope = 'service'                                -- service-scope only
  AND rc.category_code <> 'FIRST_TIME_DECISION'                -- D-055 — First-Time lives in Summary Card only
  AND so.service_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
GROUP BY date_trunc('week', so.service_date), rc.id, rc.category_name
ORDER BY week_start, rc.category_name;
```

```sql
-- Sub-query B: church_period_entries weekly totals
-- period_date is already Monday-of-week when entry_period_type='week'.
-- For 'day' entries, date_trunc('week', period_date) groups daily values into their containing week.
-- For 'month' entries, period_date is first-of-month; application layer decides how to handle
--   month aggregates in a weekly view — default: count it once in its containing week.
SELECT
  date_trunc('week', pe.period_date) AS week_start,
  rc.id                              AS category_id,
  rc.category_name,
  st.tag_code,
  pe.entry_period_type,
  SUM(pe.stat_value) FILTER (WHERE pe.is_not_applicable = false) AS weekly_total
FROM church_period_entries pe
JOIN response_categories rc ON rc.id = pe.response_category_id
JOIN service_tags         st ON st.id = pe.service_tag_id
WHERE pe.church_id = $1
  AND rc.is_active = true
  AND st.is_active = true
  AND pe.period_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '1 year'
GROUP BY date_trunc('week', pe.period_date), rc.id, rc.category_name, st.tag_code, pe.entry_period_type
ORDER BY week_start, rc.category_name, st.tag_code;
```

**UI shape (E8):** application layer groups the UNION result by `(category_id, tag_code)` into one row per pair. Label format:
- `{category_name}` when `tag_code IS NULL` (service-scope)
- `{category_name} ({tag_code})` when `tag_code` is set (period entries)

Each row surfaces four time-window values (Col1 Current Week · Col2 Last 4-Wk Avg · Col3 Current YTD Avg · Col4 Prior YTD Avg) computed from its weekly totals, same logic as P14a–d.

**Notes on P14d–g (summary):**
- Every query filters `status = 'active'` (Rule 1).
- Every query respects NULL ≠ zero (Rule 4) — FILTER clauses exclude NULLs from the sum so they don't enter the average.
- Four-column assembly happens in the application layer from one year's worth of weekly totals. Same in-memory reduction as existing `dashboard.ts:weeklyTotals` / `weekSum` / `periodWeekSum` / `periodWeeklyTotals`.
- Tracking flags (D-045) are enforced before rendering, not in SQL.

---

## Stats Query Revisions (D-034 + D-035)

P9, P10, P11 rewritten below. Original versions above are superseded.
Stats are now single values per occurrence — no audience group breakdown.

### P9 (revised) — Stats Totals by Category

```sql
SELECT
  rc.category_name,
  rc.category_code,
  rc.is_custom,
  rc.display_order,
  SUM(re.stat_value) FILTER (WHERE re.is_not_applicable = false) AS total_stat_value,
  COUNT(DISTINCT re.service_occurrence_id) AS occurrences_with_data
FROM response_categories rc
LEFT JOIN response_entries re ON re.response_category_id = rc.id
LEFT JOIN service_occurrences so ON so.id = re.service_occurrence_id
WHERE rc.church_id = $1
  AND rc.is_active = true
  AND (so.church_id = $1 AND so.status = 'active'
       AND so.service_date >= $2 AND so.service_date <= $3
       OR re.id IS NULL)
GROUP BY rc.id, rc.category_name, rc.category_code, rc.is_custom, rc.display_order
ORDER BY rc.display_order, rc.category_name;
```

### P10 (revised) — Stats Trend Over Time

```sql
SELECT
  date_trunc('week', so.service_date) AS week_start,
  rc.category_name,
  rc.category_code,
  SUM(re.stat_value) FILTER (WHERE re.is_not_applicable = false) AS weekly_total
FROM service_occurrences so
JOIN response_entries re ON re.service_occurrence_id = so.id
JOIN response_categories rc ON rc.id = re.response_category_id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date >= $2
  AND rc.is_active = true
GROUP BY date_trunc('week', so.service_date), rc.id, rc.category_name, rc.category_code
ORDER BY week_start, rc.display_order;
```

### P11 (revised) — Total Salvations (First-Time Decisions)

```sql
SELECT
  SUM(re.stat_value) FILTER (WHERE re.is_not_applicable = false) AS total_first_time_decisions
FROM service_occurrences so
JOIN response_entries re ON re.service_occurrence_id = so.id
JOIN response_categories rc ON rc.id = re.response_category_id
WHERE so.church_id = $1
  AND so.status = 'active'
  AND so.service_date >= $2
  AND so.service_date <= $3
  AND rc.category_code = 'FIRST_TIME_DECISION';
```

**Note:** P14a/b/c stats row = SUM of ALL active stat_value entries per occurrence.
Apply FILTER (WHERE is_not_applicable = false) in all stats aggregations.
Custom stats included in dashboard totals unless is_active = false.

---

## T_HISTORY Screen Queries (Historical Data Review)

### P15a — History Grid: Occurrence Rows with Entry Totals

Primary load query for T_HISTORY. Returns one row per active occurrence in the date range with
attendance fields and pre-aggregated giving/volunteer totals. Application layer pivots by
service_date + service_template_id to build the one-row-per-date column-group structure.

```sql
-- P15a: History Grid — occurrence rows with attendance and totals
-- Parameters: $1 DATE (date_from), $2 DATE (date_to)
-- church_id from RLS via get_user_church_ids()
-- Returns one row per occurrence (not per date) — pivot in application layer

SELECT
  so.id                                                       AS occurrence_id,
  so.service_date,
  so.service_template_id,
  st.display_name                                             AS service_name,
  st.sort_order                                               AS service_sort_order,
  sl.display_name                                             AS location_name,

  -- Attendance (NULL = not entered, 0 = confirmed zero — Rule 4)
  ae.main_attendance,
  ae.kids_attendance,
  ae.youth_attendance,

  -- Giving total (NULL if no entries — Rule 5: always SUM, never assume one row)
  (SELECT SUM(ge.giving_amount)
   FROM giving_entries ge
   WHERE ge.service_occurrence_id = so.id)                    AS giving_total,

  -- Volunteer total (calculated, never stored — Rule 3)
  (SELECT SUM(ve.volunteer_count)
   FROM volunteer_entries ve
   WHERE ve.service_occurrence_id = so.id
     AND ve.is_not_applicable = false)                        AS volunteer_total

FROM service_occurrences so
JOIN service_templates    st  ON st.id  = so.service_template_id
  AND st.is_active = true
  AND st.primary_tag_id IS NOT NULL   -- active_tagged_services rule: only tagged templates
JOIN church_locations     sl  ON sl.id  = so.location_id
LEFT JOIN attendance_entries ae ON ae.service_occurrence_id = so.id

WHERE so.status = 'active'            -- Rule 1: never include cancelled occurrences
  AND so.service_date BETWEEN $1 AND $2
ORDER BY so.service_date DESC, st.sort_order ASC;
```

**Why LEFT JOIN on attendance_entries:** An occurrence may exist without an attendance record
if data has not been entered. LEFT JOIN surfaces the gap — the cell shows `—` and is editable.

**Pivot logic (application layer):**
Group returned rows by `service_date`. Within each date, key by `service_template_id`.
Result shape: `Record<serviceDate, Record<templateId, ServiceCell>>`.

**Index usage:** `idx_service_occurrences_church_date` on `(church_id, service_date)` covers the
primary WHERE filter. Giving/volunteer sub-selects use `idx_giving_occurrence` and
`idx_volunteer_entries_occurrence` respectively.

---

### P15b — History Grid: Service-Scope Stats per Occurrence (batch)

Load all service-scope stats for the occurrences returned by P15a in one round-trip.
Called after P15a with the full list of occurrence IDs.

```sql
-- P15b: History Grid — service-scope stats per occurrence (batch load)
-- Parameters: $1 UUID[] (occurrence_ids from P15a result)
-- Returns one row per (occurrence_id, category_id)
-- audience_group_code IS NULL filter = service-scope only (not audience-level)

SELECT
  re.service_occurrence_id,
  re.response_category_id,
  rc.category_name,
  rc.display_order,
  re.stat_value,
  re.is_not_applicable
FROM response_entries re
JOIN response_categories rc ON rc.id = re.response_category_id
WHERE re.service_occurrence_id = ANY($1)
  AND re.audience_group_code IS NULL    -- service-scope stats only
  AND rc.is_active = true
  AND rc.stat_scope = 'service'         -- only stat_scope='service' rows in history grid
ORDER BY re.service_occurrence_id, rc.display_order;
```

**Why audience-scope stats are excluded:** Including per-audience breakdowns per occurrence
per service would produce an explosive column count. Audience-level stat corrections should
be made via the T4 entry screen (accessible from E10 occurrence link in T_HISTORY).

**Save pattern for stat cells (T_HISTORY inline edit):**
DELETE + INSERT for `(service_occurrence_id, response_category_id, audience_group_code IS NULL)`.
Same as T4 service-scope save pattern. Do not use UPSERT — the partial unique index
on `audience_group_code IS NULL` makes DELETE+INSERT the safe approach.

```sql
-- Delete existing service-scope entry for this occurrence + category
DELETE FROM response_entries
WHERE service_occurrence_id = $1
  AND response_category_id  = $2
  AND audience_group_code IS NULL;

-- Insert new value (omit if user cleared the cell — NULL = not entered)
INSERT INTO response_entries
  (service_occurrence_id, response_category_id, stat_value, audience_group_code, is_not_applicable)
VALUES ($1, $2, $3, NULL, false);
```

---

## T_WEEKLY Screen Queries (Church-Wide Period Giving)

### P16a — Weekly Giving: Load Amounts for a Period Date

```sql
-- P16a: T_WEEKLY — load existing weekly giving amounts for one week
-- Parameters: $1 = church_id, $2 = period_date (Sunday-anchored — D-056)
-- Returns one row per giving source that has an entry for that week.
-- JOIN giving_sources to get display order for UI rendering.
-- Sources with no row = no amount entered (render as empty input).

SELECT
  cpg.giving_source_id,
  cpg.giving_amount,
  gs.source_name,
  gs.display_order
FROM church_period_giving cpg
JOIN giving_sources gs ON gs.id = cpg.giving_source_id
WHERE cpg.church_id         = $1
  AND cpg.entry_period_type = 'week'
  AND cpg.period_date       = $2
ORDER BY gs.display_order;
```

**Application layer:** Fetch all active giving_sources separately. Merge with P16a result
using `giving_source_id` as key. Sources missing from P16a result render as empty inputs.

---

### P16b — Weekly Giving: Save (UPSERT or DELETE per source)

**UPSERT** when the user has entered or changed an amount:

```sql
INSERT INTO church_period_giving
  (church_id, giving_source_id, entry_period_type, period_date, giving_amount, submitted_by)
VALUES ($1, $2, 'week', $3, $4, $5)
ON CONFLICT (church_id, giving_source_id, entry_period_type, period_date)
DO UPDATE SET
  giving_amount = EXCLUDED.giving_amount,
  submitted_by  = EXCLUDED.submitted_by,
  updated_at    = now();
```

**DELETE** when the user clears an input (empty = no data entered — D-003 NULL ≠ 0):

```sql
DELETE FROM church_period_giving
WHERE church_id         = $1
  AND giving_source_id  = $2
  AND entry_period_type = 'week'
  AND period_date       = $3;
```

**Save logic in application layer:**
- For each active giving source: compare current input value to original loaded value
- Unchanged inputs: skip (no write)
- Changed to a valid amount: UPSERT
- Changed to empty: DELETE (if a row existed)
- `period_date` = Sunday on or before the entry date (ISO YYYY-MM-DD) — D-056
- `submitted_by` = current user's auth.uid()

---

### P16c — Weekly Stats: Load Untagged Week-Scope Entries

```sql
-- P16c: T_WEEKLY_STATS — load existing week-scope, church-wide (untagged) stat entries
SELECT response_category_id, stat_value, is_not_applicable
FROM church_period_entries
WHERE church_id         = $1
  AND entry_period_type = 'week'
  AND period_date       = $2   -- Sunday on or before
  AND service_tag_id IS NULL;
```

**Application layer:** Fetch all active `response_categories` with `stat_scope = 'week'` separately.
Merge with P16c by `response_category_id`. Categories missing from the result render as empty inputs.

---

### P16d — Weekly Stats: Save (UPDATE / INSERT / DELETE — service_tag_id IS NULL branch)

PostgREST cannot match an upsert conflict target on a NULLable column, so the save path is
**select-then-update-or-insert** rather than UPSERT. The UNIQUE constraint
`uq_period_entry_untagged` (added in 0014) still guards the table.

```sql
-- 1. Look up existing untagged row for this category/week
SELECT id FROM church_period_entries
WHERE church_id            = $1
  AND response_category_id = $2
  AND entry_period_type    = 'week'
  AND period_date          = $3
  AND service_tag_id IS NULL;

-- 2a. If row exists → UPDATE
UPDATE church_period_entries
SET stat_value = $4, is_not_applicable = $5
WHERE id = $existing_id;

-- 2b. If no row exists → INSERT
INSERT INTO church_period_entries
  (church_id, service_tag_id, response_category_id,
   entry_period_type, period_date, stat_value, is_not_applicable)
VALUES ($1, NULL, $2, 'week', $3, $4, $5);
```

**DELETE** when the user clears the input (D-003: empty ≠ 0):

```sql
DELETE FROM church_period_entries
WHERE church_id            = $1
  AND response_category_id = $2
  AND entry_period_type    = 'week'
  AND period_date          = $3
  AND service_tag_id IS NULL;
```

**Save logic:**
- Unchanged: skip
- Cleared (empty + not N/A): DELETE if a row existed
- Numeric value entered: UPDATE if row exists, else INSERT
- N/A toggled on: store row with `stat_value = NULL` and `is_not_applicable = true`
