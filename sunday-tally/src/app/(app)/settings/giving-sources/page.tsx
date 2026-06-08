// T_GIVING_SOURCES — retired; redirects to /settings/track (IRIS_TTRACK_ELEMENT_MAP)
// giving_sources table was dropped in migration 0022.

import { redirect } from 'next/navigation'

export default function SettingsGivingSourcesPage() {
  redirect('/settings/track')
}
