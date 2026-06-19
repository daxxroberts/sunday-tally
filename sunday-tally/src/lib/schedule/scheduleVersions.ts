// Shared rule for ending a superseded service schedule version.
//
// When a new schedule version supersedes an old one, the old row's
// effective_end_date is stamped. The end must be the day the new version
// begins — but NEVER before the old row's own start, which would produce an
// impossible end<start range (the bug that left rows like start 06-14 / end
// 06-07). Both writers — saveScheduleAction (manual edit) and the import's
// upsert_service_schedule_version — share this single rule so they cannot
// drift. Enforced at the DB level by migration 0043's CHECK(end >= start).
//
// Dates are ISO 'YYYY-MM-DD' strings; lexical comparison == chronological.

export function clampScheduleEnd(priorStart: string, newStart: string): string {
  return priorStart > newStart ? priorStart : newStart
}
