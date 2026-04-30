# Import Eval Set
## Version 1.0 | 2026-04-18
## Purpose: Benchmark Claude import/setup quality against Sunday Tally rules

---

## Success Metrics

Evaluate each scenario on:

- correct service identity inference
- correct anomaly detection
- question quality
- dashboard-safe recommendation
- unnecessary question count
- mapping correctness

---

## Scenario 1 - Clean Sequential Time Shift

Input pattern:

- Sunday 9:30 for 18 months
- then Sunday 9:20 for 9 months
- then Sunday 9:00 for 12 months
- no overlap

Expected outcome:

- one logical service
- schedule versions over time
- no anomaly question required unless other evidence conflicts

---

## Scenario 2 - Temporary Third Service

Input pattern:

- normal recurring 9:00 and 11:00 services
- 1:00 PM appears for 6 weeks only

Expected outcome:

- detect anomaly
- recommend temporary additional service / review
- ask clarification question before recurring setup write

---

## Scenario 3 - Permanent Additional Service

Input pattern:

- 9:00 and 11:00 exist for years
- 1:00 PM appears and continues for many months

Expected outcome:

- infer a separate recurring service

---

## Scenario 4 - One-Off Holiday Service

Input pattern:

- Christmas Eve and Easter-only entries
- unusual times

Expected outcome:

- treat as special/standalone occurrences
- do not create long-term recurring service template automatically

---

## Scenario 5 - Renamed Same Service

Input pattern:

- `Sunday AM`
- `Morning Worship`
- `First Service`
- same weekly slot and continuity evidence

Expected outcome:

- recommend one logical service
- optionally suggest stable display name

---

## Scenario 6 - Ambiguous Stats Mapping

Input pattern:

- source column labeled `Salvations`

Expected outcome:

- do not silently map to `First-Time Decision`
- ask clarification or use existing church rule if present

---

## Scenario 7 - Attendance Totals Only

Input pattern:

- total attendance available
- no kids/youth split

Expected outcome:

- preserve total
- do not silently invent splits
- ask or use church default rule if one exists

---

## Scenario 8 - Multiple Files With Conflicting Labels

Input pattern:

- file A uses `Sunday AM`
- file B uses `9:30 Worship`
- file C uses `First Service`

Expected outcome:

- merge evidence across files
- propose one service if continuity is strong
- ask only if conflict materially affects dashboard structure

---

## Scenario 9 - Saturday Experiment

Input pattern:

- brief Saturday evening run for 8 weeks
- no continuation

Expected outcome:

- anomaly flag
- question before recurring setup decision

---

## Scenario 10 - Dashboard Split Risk

Input pattern:

- same logical service accidentally appears under two labels after a rename

Expected outcome:

- detect dashboard split risk
- prefer continuity
- explain why merge protects trend continuity

