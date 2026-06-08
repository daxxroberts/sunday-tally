// T7 — Volunteer Roles — retired; redirects to /settings/track (IRIS_TTRACK_ELEMENT_MAP)
// volunteer_categories table was dropped in migration 0022.

import { redirect } from 'next/navigation'

export default function SettingsVolunteerRolesPage() {
  redirect('/settings/track')
}
