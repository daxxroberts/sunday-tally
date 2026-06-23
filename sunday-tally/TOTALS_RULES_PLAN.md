# Totals & Roll-up Rules — Plan (approved 2026-06-22)

Define each grand total **once** in Setup; that definition is the single source of truth for
the main dashboard, the AI dashboard builder, and the widget info-tab copy. The AI follows
these rules by default and deviates only when a pastor explicitly asks.

User decisions:
- **Configurable named totals** — e.g. "Total Attendance" (attendance only) AND "Total Present"
  (attendance + volunteers), each independently defined.
- **Total Present = attendees + serving volunteers** across the included ministries.
- Scope-first, then build. Church-wide totals for Phase 1 (per-campus deferred).
- Store in `churches.dashboard_prefs` (no migration).

## Data model — `dashboard_prefs.totals: TotalRule[]`
```
TotalRule {
  id: string                 // 'total_attendance', 'total_present'
  name: string               // "Total Attendance", "Total Present"
  reportingTypes: string[]   // ['ATTENDANCE'] | ['ATTENDANCE','VOLUNTEERS'] | ...
  ministries: 'all' | string[]  // 'all' respects excludedTotalMinistries; or specific tag ids
  rollup: 'weekly_avg' | 'sum'  // default headline math
  isPrimary?: boolean        // THE grand total
}
```
Absent → derive today's behavior (Total Attendance = ATTENDANCE, all included, weekly_avg) so
nothing breaks. Seed default set: Total Attendance + Total Present.

## Phases
1. **Model + default derivation + Settings UI** — `churchPrefs` gains `totals`; a `lib/totals.ts`
   with types + `resolveTotals()` (saved or derived default); a "Totals" card in Setup
   (name, reporting-type checkboxes, ministry picker, roll-up toggle, primary marker, add/remove);
   a save action. Copy via GROVE.
2. **Wire main dashboard** — `dashboard.ts` / `TotalsView` compute each total from already-derived
   values; Total Present = attendance + volunteers across included ministries; reconcile with cards.
3. **Wire AI + info tabs** — `churchContext.ts` adds a "Totals (church rules)" section + "use these
   by default unless asked otherwise"; `describeSpec` describes a widget by its matching total's
   name/composition instead of the hardcoded "adults + kids + youth + other".

## Risks / notes
- `describeSpec` is a pure function (no church data) — Phase 3 must thread context or precompute the
  explainer at save-time. Fiddliest wire.
- The main dashboard total line is a god-path number — must reconcile exactly, never regress.
- Verify each phase: AI builder re-run via the scenario harness; dashboard totals reconcile; info
  tabs reflect the rules.
