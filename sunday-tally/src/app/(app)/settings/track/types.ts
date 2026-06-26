// ─────────────────────────────────────────────────────────────────────────
// T_TRACK — shared data shapes + small helpers for /settings/track.
// Extracted from page.tsx (P4c structural split) — no logic changes.
// ─────────────────────────────────────────────────────────────────────────

import type { UserRole } from '@/types'
import type { TagRole, MetricRow, RollupOp } from './actions'

// ── Data shapes ────────────────────────────────────────────────────────────

export interface ReportingTag { id: string; code: string; name: string }

export interface Ministry {
  id: string
  code: string
  name: string
  tag_role: TagRole
  parent_tag_id: string | null
  display_order: number | null
  is_active: boolean
  /** Church-chosen hex (0040); null/undefined = positional palette. */
  color?: string | null
}

/** A metric with its owning node id (flat list is the source of truth). */
export type Metric = MetricRow & { ministry_tag_id: string }

// The four system reporting tags every church is seeded with (0024). Giving is
// a peer kind, not a church-wide special case — counts under it can ride a
// service occurrence (per-service giving) or stay weekly church-wide.
export const SYSTEM_KINDS = ['ATTENDANCE', 'VOLUNTEERS', 'RESPONSE_STAT', 'GIVING'] as const
export type KindCode = (typeof SYSTEM_KINDS)[number]

export const KIND_LABEL: Record<KindCode, string> = {
  ATTENDANCE: 'Attendance',
  VOLUNTEERS: 'Volunteers',
  RESPONSE_STAT: 'Stats',
  GIVING: 'Giving',
}
export const KIND_PLACEHOLDER: Record<KindCode, string> = {
  ATTENDANCE: 'Attendance',
  VOLUNTEERS: 'Band',
  RESPONSE_STAT: 'Baptisms',
  GIVING: 'Bucket',
}

export const ROLE_OPTIONS: { value: TagRole; label: string }[] = [
  { value: 'ADULT_SERVICE', label: 'Adults' },
  { value: 'KIDS_MINISTRY', label: 'Kids' },
  { value: 'YOUTH_MINISTRY', label: 'Students' },
  { value: 'OTHER', label: 'Other' },
]

export const OP_LABEL: Record<RollupOp, string> = { sum: 'Sum', avg: 'Average', max: 'Largest' }

export function canWrite(role: UserRole) {
  return role === 'owner' || role === 'admin'
}

// Muted, low-emphasis role chip — the colored accent bar already carries the
// group color, so the role reads as quiet metadata (Builder feedback 2026-06-08).
export function rolePillClasses(): string {
  return 'bg-slate-100 text-slate-400'
}
