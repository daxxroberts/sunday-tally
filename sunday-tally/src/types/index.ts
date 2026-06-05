// ─── Role Types ────────────────────────────────────────────────────────────────
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'

// ─── Church ────────────────────────────────────────────────────────────────────
export interface Church {
  id: string
  name: string
  created_at: string
  tracks_main_attendance: boolean
  tracks_kids_attendance: boolean
  tracks_youth_attendance: boolean
  tracks_volunteers: boolean
  tracks_responses: boolean
  tracks_giving: boolean
  // churches.grid_config (nullable jsonb): persisted Entries/Dashboard/History
  // customize state — grid layout (GridConfig) merged with include-in-total prefs.
  // Read via narrowed casts at each call site; kept permissive here on purpose.
  grid_config?: Record<string, unknown> | null
}

// ─── Church Membership ─────────────────────────────────────────────────────────
export interface ChurchMembership {
  id: string
  church_id: string
  user_id: string
  role: UserRole
  is_active: boolean
  created_at: string
}

// ─── Location ──────────────────────────────────────────────────────────────────
export interface ChurchLocation {
  id: string
  church_id: string
  name: string
  is_active: boolean
  sort_order: number
}

// ─── Service Template ──────────────────────────────────────────────────────────
export interface ServiceTemplate {
  id: string
  church_id: string
  location_id: string
  display_name: string
  is_active: boolean
  sort_order: number
  primary_tag_id: string | null
}

// ─── Service Occurrence ────────────────────────────────────────────────────────
export type OccurrenceStatus = 'active' | 'cancelled'

export interface ServiceInstance {
  id: string
  church_id: string
  service_template_id: string
  location_id: string
  service_date: string   // ISO date YYYY-MM-DD
  status: OccurrenceStatus
  created_at: string
}

// ─── Attendance ────────────────────────────────────────────────────────────────
export interface AttendanceEntry {
  id: string
  service_instance_id: string
  main_attendance: number | null
  kids_attendance: number | null
  youth_attendance: number | null
}

export interface VolunteerCategory {
  id: string
  church_id: string
  category_name: string
  category_code: string
  primary_tag_id: string | null
  is_active: boolean
  sort_order: number
}

export interface VolunteerEntry {
  id: string
  service_instance_id: string
  volunteer_category_id: string
  volunteer_count: number
  is_not_applicable: boolean
}

// ─── Response / Stats Categories ───────────────────────────────────────────────
export type StatScope = 'service' | 'day' | 'week' | 'month'

export interface ResponseCategory {
  id: string
  church_id: string
  category_name: string
  category_code: string
  stat_scope: StatScope
  primary_tag_id: string | null
  is_active: boolean
  is_custom: boolean
  display_order: number
}

export interface ResponseEntry {
  id: string
  service_instance_id: string
  response_category_id: string
  stat_value: number
  is_not_applicable: boolean
}

export interface PeriodEntry {
  id: string
  church_id: string
  service_tag_id: string
  response_category_id: string
  entry_period_type: 'day' | 'week' | 'month'
  period_date: string   // ISO date YYYY-MM-DD
  stat_value: number | null
  is_not_applicable: boolean
}

// ─── Giving ────────────────────────────────────────────────────────────────────
export interface GivingSource {
  id: string
  church_id: string
  source_name: string
  source_code: string
  is_active: boolean
  sort_order: number
}

export interface GivingEntry {
  id: string
  service_instance_id: string
  giving_source_id: string
  giving_amount: string   // NUMERIC(12,2) — use string to avoid float errors
}

export interface PeriodGivingEntry {
  id: string
  church_id: string
  giving_source_id: string
  entry_period_type: 'week' | 'month'
  period_date: string   // ISO date — Monday of week or 1st of month
  giving_amount: string // NUMERIC(12,2) — string to avoid float errors
}

// ─── Service Tags ──────────────────────────────────────────────────────────────
export interface ServiceTag {
  id: string
  church_id: string
  tag_name: string
  tag_code: string
  is_active: boolean
  effective_start_date: string | null
  effective_end_date: string | null
}

// ─── Session Context ───────────────────────────────────────────────────────────
export interface SundaySession {
  occurrenceId: string
  serviceDisplayName: string
  serviceDate: string       // YYYY-MM-DD
  locationName: string
}

// ─── Completion Helpers ────────────────────────────────────────────────────────
export interface OccurrenceCompletionFlags {
  attendance_entered: boolean
  volunteers_entered: boolean
  responses_entered: boolean
  giving_entered: boolean
}

export function isOccurrenceComplete(
  flags: OccurrenceCompletionFlags,
  church: Pick<Church, 'tracks_volunteers' | 'tracks_responses' | 'tracks_giving'>
): boolean {
  return (
    flags.attendance_entered &&
    (!church.tracks_volunteers || flags.volunteers_entered) &&
    (!church.tracks_responses  || flags.responses_entered)  &&
    (!church.tracks_giving     || flags.giving_entered)
  )
}
