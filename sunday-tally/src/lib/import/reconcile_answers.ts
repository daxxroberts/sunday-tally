/**
 * Answer→Mapping Reconciliation — closes the loop that clarification questions opened.
 *
 * Codex review (2026-04-30) flagged that the walkthrough asks the user structurally
 * significant questions but the answers never mutate the mapping that Stage B's
 * deterministic extractor uses. This module fixes that, server-side.
 *
 * IR v2 (metric-centric; see IMPORT_IR_V2.md). The answer model is now:
 *   1. If a QaAnswer carries a structured `patch_op`, it is routed through the
 *      SHARED `applyPatchOp` — the identical applier the client walkthrough uses,
 *      so server-side reconcile and client-side preview never diverge.
 *   2. Two free-text questions keep deterministic parsers because their answers are
 *      not a single option value but parsed text mapped across multiple templates:
 *        - `q_service_names` → parse "code = name" / bare names → set template
 *          display_names (each match routed via set_template_display_name).
 *        - `q_service_times` → parse "name: HH:MM" / bare times → set start_times
 *          (each match routed via set_template_start_time).
 *
 * The v1 dropped-concept handlers are GONE: audience structure (M1/M2/M3),
 * per-service volunteer audience, and giving service-vs-weekly scope. Those concepts
 * fold into the metric model — service-vs-weekly is a metric `scope` decision
 * (set_metric_scope), audience is a ministry-tag `tag_role` (set_ministry_tag_role) —
 * both handled generically through `patch_op` now.
 *
 * Unknown / unrecognized question_ids fall through unchanged; their answers still
 * travel forward via `qa_answers` as advisory context for Stage B's setup writer.
 *
 * `ConfirmedSourceMapping.dest_table` is decorative in IR v2 — this module never
 * reads or writes it.
 */
import 'server-only'
import type { ConfirmedMapping, QaAnswer } from './stageB'
import type { PatchOp, ProposedSetup, ProposedServiceTemplate } from './stageA_validate'
import { applyPatchOp } from './apply_patch_op'

interface ReconcileOptions {
  /** Verbose log channel — pushes one line per mutation applied. */
  log?: (line: string) => void
}

/**
 * A QaAnswer may carry a structured `patch_op` at runtime (populated by the
 * walkthrough / validator when the question has metric-centric semantics). The
 * shared `QaAnswer` interface in stageB.ts does not declare it, so we read it via
 * this widened view rather than mutating that interface.
 */
type QaAnswerWithPatch = QaAnswer & { patch_op?: PatchOp; value?: string }

/**
 * Apply qa_answers to confirmed_mapping deterministically.
 * Returns a new ConfirmedMapping (does not mutate input).
 */
export function reconcileAnswersIntoMapping(
  mapping: ConfirmedMapping,
  opts: ReconcileOptions = {},
): ConfirmedMapping {
  const log = opts.log ?? (() => {})
  // Deep-clone so we don't mutate the caller's mapping (idempotent + testable).
  const m: ConfirmedMapping = JSON.parse(JSON.stringify(mapping))
  const answers: QaAnswerWithPatch[] = (m.qa_answers ?? []) as QaAnswerWithPatch[]

  // proposed_setup is typed loosely (Record<string,unknown>) on ConfirmedMapping but
  // carries the IR v2 ProposedSetup shape at runtime — the shared applier mutates it
  // in place, so we hand it the same object reference.
  const setup = m.proposed_setup as ProposedSetup | undefined

  for (const a of answers) {
    if (!a.id || !a.accepted) continue

    // ── 1. Structured patch_op answers → shared applier (metric-centric) ──
    // The option's machine value lives in `meaning_code` (choice questions) or
    // `value`; fall back to the free-text answer.
    if (a.patch_op) {
      if (!setup) {
        log(`${a.id}: patch_op ${a.patch_op.kind} skipped — no proposed_setup`)
        continue
      }
      const answerValue = a.meaning_code ?? a.value ?? a.answer
      applyPatchOp(setup, a.patch_op, answerValue)
      log(`${a.id}: applied patch_op ${a.patch_op.kind} (value="${answerValue ?? ''}")`)
      continue
    }

    // ── 2. Free-text multi-template parsers (kept; route via shared applier) ──
    if (a.id === 'q_service_names') {
      applyServiceNames(setup, a, log)
      continue
    }

    if (a.id === 'q_service_times') {
      applyServiceTimes(setup, a, log)
      continue
    }

    // ── 3. Everything else → advisory pass-through (left in qa_answers) ──
    // q_pattern_service_count, q_pattern_audience_terms, q_pattern_date_range,
    // and any id without a patch_op. Stage B's setup writer reads qa_answers context.
    // (Dropped v1 ids — q_pattern_audience_structure, q_volunteer_audience_*,
    //  q_pattern_giving_scope — are no longer special-cased; if they arrive without
    //  a patch_op they simply pass through as advisory text.)
  }

  return m
}

// ─── q_service_names: parse "Code 1 = Name A, Code 2 = Name B" or one-per-line ──
// Replaces [BLOCKING] display_names with the user's provided names. Each matched
// template is mutated via the shared set_template_display_name patch op so the
// semantics are identical to the walkthrough.
function applyServiceNames(
  setup: ProposedSetup | undefined,
  a: QaAnswer,
  log: (s: string) => void,
) {
  if (!setup) return
  const tmpls = setup.service_templates
  if (!Array.isArray(tmpls)) return

  // Parse "Code N = Name" or "N = Name" or "service_code: Name" patterns.
  const lines = String(a.answer ?? '').split(/[\n,;]/).map(l => l.trim()).filter(Boolean)
  const codeNamePairs: Array<{ code: string; name: string }> = []
  const bareNames: string[] = []
  for (const line of lines) {
    // Try "Code 1 = Name", "1 = Name", "code 1: Name", "1: Name"
    const m1 = line.match(/(?:code\s+)?["']?([A-Za-z0-9_-]+)["']?\s*[:=]\s*(.+)$/i)
    if (m1) {
      codeNamePairs.push({ code: m1[1].trim(), name: m1[2].trim().replace(/^["']|["']$/g, '') })
    } else if (line.length > 0) {
      bareNames.push(line.replace(/^["']|["']$/g, ''))
    }
  }

  const isBlocking = (t: ProposedServiceTemplate) =>
    String(t.display_name ?? '').includes('[BLOCKING]')
  const blockingTmpls = tmpls.filter(isBlocking)
  let renamed = 0

  // Primary path: code-matched pairs (route each through the shared applier).
  for (const t of blockingTmpls) {
    const tcode = String(t.service_code ?? '').toUpperCase()
    const match = codeNamePairs.find(p => p.code.toUpperCase() === tcode)
    if (match) {
      applyPatchOp(setup, { kind: 'set_template_display_name', service_code: t.service_code }, match.name)
      renamed++
    }
  }

  // Fallback: assign bare names in order to remaining [BLOCKING] templates.
  if (renamed === 0 && bareNames.length > 0) {
    const stillBlocking = blockingTmpls.filter(isBlocking)
    for (let i = 0; i < Math.min(bareNames.length, stillBlocking.length); i++) {
      applyPatchOp(
        setup,
        { kind: 'set_template_display_name', service_code: stillBlocking[i].service_code },
        bareNames[i],
      )
      renamed++
    }
    if (renamed > 0) log(`q_service_names: assigned ${renamed} bare name(s) in order to [BLOCKING] templates`)
  }

  if (renamed > 0) log(`q_service_names: renamed ${renamed} templates from [BLOCKING] to user-provided names`)
}

// ─── q_service_times: parse "Service Name: 09:00" lines ─────────────────────
// Sets start_time on each template (routed via set_template_start_time).
function applyServiceTimes(
  setup: ProposedSetup | undefined,
  a: QaAnswer,
  log: (s: string) => void,
) {
  if (!setup) return
  const tmpls = setup.service_templates
  if (!Array.isArray(tmpls)) return

  // Normalise a raw time token to "HH:MM:SS" or null.
  function normaliseTime(raw: string): string | null {
    // Already HH:MM or HH:MM:SS
    const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (hhmm) return `${String(hhmm[1]).padStart(2, '0')}:${hhmm[2]}:00`
    // "9am", "10:30am", "9:00am", "14:30pm"
    const ampm = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)$/i)
    if (ampm) {
      let h = parseInt(ampm[1], 10)
      const min = ampm[2] ?? '00'
      const meridiem = (ampm[4] ?? '').toLowerCase()
      if (meridiem === 'pm' && h < 12) h += 12
      if (meridiem === 'am' && h === 12) h = 0
      return `${String(h).padStart(2, '0')}:${min}:00`
    }
    return null
  }

  // Parse free-text "Name: 09:00" lines
  const rawText = String(a.answer ?? '')
  const lines = rawText.split(/\n/).map(l => l.trim()).filter(Boolean)
  type TimePair = { name: string; time: string }
  const nameTimePairs: TimePair[] = []
  const bareTimes: string[] = []

  for (const line of lines) {
    const cleaned = line.replace(/^[-*•]\s*/, '')
    // "Name: HH:MM" or "Name = HH:MM" with optional am/pm
    const named = cleaned.match(/^(.+?)\s*[:=]\s*(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:am|pm)?)\s*$/i)
    if (named) {
      const t = normaliseTime(named[2].trim())
      if (t) { nameTimePairs.push({ name: named[1].trim().toLowerCase(), time: t }); continue }
    }
    // Bare time token on its own line: "09:00", "9am", "10:30am"
    const bare = cleaned.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i)
    if (bare) {
      const t = normaliseTime(bare[1].trim())
      if (t) { bareTimes.push(t); continue }
    }
  }

  // Also extract bare times from inline "X and Y" phrasing ("9am and 10:30am")
  if (nameTimePairs.length === 0 && bareTimes.length === 0) {
    const tokens = rawText.split(/\s+(?:and|,|;|\|)\s*/i)
    for (const tok of tokens) {
      const t = normaliseTime(tok.trim())
      if (t) bareTimes.push(t)
    }
  }

  // Primary: match by name (route each through the shared applier).
  let stamped = 0
  for (const t of tmpls) {
    const dn = String(t.display_name ?? '').toLowerCase()
    const sc = String(t.service_code ?? '').toLowerCase()
    const match = nameTimePairs.find(p =>
      dn.includes(p.name) || p.name.includes(dn) || sc.includes(p.name) || p.name.includes(sc)
    )
    if (match) {
      applyPatchOp(setup, { kind: 'set_template_start_time', service_code: t.service_code }, match.time)
      stamped++
    }
  }

  // Fallback: assign bare times in order to templates that still have no start_time.
  if (bareTimes.length > 0) {
    const unstamped = tmpls.filter(t => !t.start_time)
    const n = Math.min(bareTimes.length, unstamped.length)
    for (let i = 0; i < n; i++) {
      applyPatchOp(
        setup,
        { kind: 'set_template_start_time', service_code: unstamped[i].service_code },
        bareTimes[i],
      )
      stamped++
    }
    if (n > 0) log(`q_service_times: assigned ${n} bare time(s) in order`)
  }

  if (stamped > 0) log(`q_service_times: stamped start_time on ${stamped} templates from user input`)
}
