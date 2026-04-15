// ─── Role Types ────────────────────────────────────────────────────────────────
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'

// ─── Church ────────────────────────────────────────────────────────────────────
export interface Church {
  id: string
  name: string
  created_at: string
  tracks_kids_attendance: boolean
  tracks_youth_attendance: boolean
  tracks_volunteers: boolean
  tracks_responses: boolean
  tracks_giving: boolean
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

export interface ServiceOccurrence {
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
  service_occurrence_id: string
  main_attendance: number | null
  kids_attendance: number | null
  youth_attendance: number | null
}

// ─── Volunteer Categories ──────────────────────────────────────────────────────
export type AudienceGroupCode = 'MAIN' | 'KIDS' | 'YOUTH'

export interface VolunteerCategory {
  id: string
  church_id: string
  category_name: string
  category_code: string
  audience_group_code: AudienceGroupCode
  is_active: boolean
  sort_order: number
}

export interface VolunteerEntry {
  id: string
  service_occurrence_id: string
  volunteer_category_id: string
  volunteer_count: number
  is_not_applicable: boolean
}

// ─── Response / Stats Categories ───────────────────────────────────────────────
export type StatScope = 'audience' | 'service'

export interface ResponseCategory {
  id: string
  church_id: string
  category_name: string
  category_code: string
  stat_scope: StatScope
  is_active: boolean
  is_custom: boolean
  display_order: number
}

export interface ResponseEntry {
  id: string
  service_occurrence_id: string
  response_category_id: string
  audience_group_code: AudienceGroupCode | null   // null for service-level stats
  stat_value: number
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
  service_occurrence_id: string
  giving_source_id: string
  giving_amount: string   // NUMERIC(12,2) — use string to avoid float errors
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
