/**
 * Answer→Mapping Reconciliation — closes the loop that pattern questions opened.
 *
 * Codex review (2026-04-30) flagged that V1.5's pattern-confirmation phase asks
 * the user structurally significant questions but the answers never mutate the
 * mapping that Stage B's deterministic extractor uses. This module fixes that.
 *
 * For each known question_id, this dispatcher applies the user's answer to the
 * confirmed_mapping (proposed_setup + sources). The output is a mutated mapping
 * that Stage B then writes to the database.
 *
 * Unknown / unrecognized question_ids fall through unchanged — the answers are
 * still passed forward via qa_answers as advisory context for Stage B's setup
 * writer (which keeps the existing prompt-driven behavior for things the
 * deterministic reconciler doesn't yet handle, like q_offering_scope, etc.).
 */
import 'server-only'
import type { ConfirmedMapping, QaAnswer } from './stageB'

interface ReconcileOptions {
  /** Verbose log channel — pushes one line per mutation applied. */
  log?: (line: string) => void
}

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
  const answers: QaAnswer[] = m.qa_answers ?? []

  for (const a of answers) {
    if (!a.id || !a.accepted) continue

    if (a.id === 'q_pattern_audience_structure') {
      applyAudienceStructure(m, a, log)
      continue
    }

    if (a.id === 'q_service_names') {
      applyServiceNames(m, a, log)
      continue
    }

    if (a.id === 'q_service_times') {
      applyServiceTimes(m, a, log)
      continue
    }

    if (a.id.startsWith('q_volunteer_audience_')) {
      applyVolunteerAudience(m, a, log)
      continue
    }

    // q_pattern_service_count, q_offering_scope, q_*_audience_meaning_freeform — pass through
    // as advisory. Stage B's setup writer reads qa_answers context.
  }

  return m
}

// ─── Q-PAT-1: three-meaning audience structure ──────────────────────────────
// meaning_code:
//   'M3' → parallel experiences within a service slot (current default — no change)
//   'M1' → one combined service, just headcount split by group
//          → flatten volunteer_categories audience_type to MAIN
//          → change response_categories stat_scope from 'audience' to 'service'
//   'M2' → fully separate services on different times/days
//          → mark mapping as needs_review; user-led template split is too risky
//             to apply deterministically without follow-up confirmation
function applyAudienceStructure(m: ConfirmedMapping, a: QaAnswer, log: (s: string) => void) {
  const code = a.meaning_code
  if (code === 'M3' || !code) {
    log(`q_pattern_audience_structure: M3 (no-op — schema already audience-split)`)
    return
  }
  if (code === 'M1') {
    const setup = m.proposed_setup as Record<string, unknown> | undefined
    if (!setup) return
    const volCats = setup.volunteer_categories as Array<Record<string, unknown>> | undefined
    if (Array.isArray(volCats)) {
      let flattened = 0
      for (const v of volCats) {
        if (v.audience_type && v.audience_type !== 'MAIN') {
          v.audience_type = 'MAIN'
          flattened++
        }
      }
      if (flattened > 0) log(`q_pattern_audience_structure: M1 — flattened ${flattened} volunteer audience tags to MAIN`)
    }
    const respCats = setup.response_categories as Array<Record<string, unknown>> | undefined
    if (Array.isArray(respCats)) {
      let rescoped = 0
      for (const r of respCats) {
        if (r.stat_scope === 'audience') {
          r.stat_scope = 'service'
          rescoped++
        }
      }
      if (rescoped > 0) log(`q_pattern_audience_structure: M1 — rescoped ${rescoped} response_categories audience→service`)
    }
    return
  }
  if (code === 'M2') {
    // Mark for review. Deterministic template-splitting is risky; surface as note.
    const setup = m.proposed_setup as Record<string, unknown> | undefined
    if (setup) {
      setup._needs_review = setup._needs_review ?? []
      ;(setup._needs_review as string[]).push(
        'M2 — Audiences are separate services. Template structure may need manual adjustment after import (split per-audience templates if appropriate).'
      )
      log(`q_pattern_audience_structure: M2 — flagged needs_review (deterministic split skipped)`)
    }
    return
  }
}

// ─── q_service_names: parse "Code 1 = Name A, Code 2 = Name B" or one-per-line ──
// Replaces [BLOCKING] display_names with the user's provided names.
function applyServiceNames(m: ConfirmedMapping, a: QaAnswer, log: (s: string) => void) {
  const setup = m.proposed_setup as Record<string, unknown> | undefined
  if (!setup) return
  const tmpls = setup.service_templates as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(tmpls)) return

  // Parse "Code N = Name" or "N = Name" or "service_code: Name" patterns.
  const lines = String(a.answer ?? '').split(/[\n,;]/).map(l => l.trim()).filter(Boolean)
  const codeNamePairs: Array<{ code: string; name: string }> = []
  for (const line of lines) {
    // Try "Code 1 = Name", "1 = Name", "code 1: Name", "1: Name"
    const m1 = line.match(/(?:code\s+)?["']?([A-Za-z0-9_-]+)["']?\s*[:=]\s*(.+)$/i)
    if (m1) {
      codeNamePairs.push({ code: m1[1].trim(), name: m1[2].trim().replace(/^["']|["']$/g, '') })
    }
  }

  let renamed = 0
  for (const t of tmpls) {
    const dn = String(t.display_name ?? '')
    if (!dn.includes('[BLOCKING]')) continue
    // Match by service_code (case-insensitive)
    const tcode = String(t.service_code ?? '').toUpperCase()
    const match = codeNamePairs.find(p => p.code.toUpperCase() === tcode)
    if (match) {
      t.display_name = match.name
      renamed++
    }
  }
  if (renamed > 0) log(`q_service_names: renamed ${renamed} templates from [BLOCKING] to user-provided names`)
}

// ─── q_service_times: parse "Service Name: 09:00" lines ─────────────────────
// Sets start_time on each template.
function applyServiceTimes(m: ConfirmedMapping, a: QaAnswer, log: (s: string) => void) {
  const setup = m.proposed_setup as Record<string, unknown> | undefined
  if (!setup) return
  const tmpls = setup.service_templates as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(tmpls)) return

  // Parse free-text "Name: 09:00" lines
  const lines = String(a.answer ?? '').split(/\n/).map(l => l.trim()).filter(Boolean)
  type TimePair = { name: string; time: string }
  const nameTimePairs: TimePair[] = []
  for (const line of lines) {
    // Strip leading "- " bullet
    const cleaned = line.replace(/^[-*•]\s*/, '')
    // Match "Name: HH:MM" or "Name HH:MM"
    const m1 = cleaned.match(/^(.+?)\s*[:=]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:am|pm|AM|PM)?$/i)
    if (m1) {
      let time = m1[2]
      if (/^\d{1,2}:\d{2}$/.test(time)) time = time.padStart(5, '0') + ':00'
      nameTimePairs.push({ name: m1[1].trim().toLowerCase(), time })
    }
  }

  let stamped = 0
  for (const t of tmpls) {
    const dn = String(t.display_name ?? '').toLowerCase()
    const sc = String(t.service_code ?? '').toLowerCase()
    const match = nameTimePairs.find(p => dn.includes(p.name) || p.name.includes(dn) || sc.includes(p.name) || p.name.includes(sc))
    if (match) {
      t.start_time = match.time
      stamped++
    }
  }
  if (stamped > 0) log(`q_service_times: stamped start_time on ${stamped} templates from user input`)
}

// ─── q_volunteer_audience_<service_code>: meaning_code is target audience ────
// If user picked "They serve the [audience]", apply that audience to the
// matching volunteer_category(ies).
function applyVolunteerAudience(m: ConfirmedMapping, a: QaAnswer, log: (s: string) => void) {
  const target = a.meaning_code  // YOUTH, KIDS, MAIN, etc.
  if (!target || !['MAIN', 'KIDS', 'YOUTH'].includes(target)) return
  const setup = m.proposed_setup as Record<string, unknown> | undefined
  if (!setup) return
  const volCats = setup.volunteer_categories as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(volCats)) return
  const tmpls = setup.service_templates as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(tmpls)) return

  // Extract service_code from question id: q_volunteer_audience_<code>
  const code = a.id!.slice('q_volunteer_audience_'.length).toUpperCase()
  const tmpl = tmpls.find(t => String(t.service_code ?? '').toUpperCase() === code)
  if (!tmpl) return
  const tplName = String(tmpl.display_name ?? '').toLowerCase()
  const tplTokens = tplName.split(/\s+/).filter(t => t.length >= 4)
  if (tplTokens.length === 0) return

  let updated = 0
  for (const v of volCats) {
    const volName = String(v.name ?? '').toLowerCase()
    if (tplTokens.some(tk => volName.includes(tk))) {
      if (v.audience_type !== target) {
        v.audience_type = target
        updated++
      }
    }
  }
  if (updated > 0) log(`${a.id}: set ${updated} volunteer_categories audience_type → ${target}`)
}
