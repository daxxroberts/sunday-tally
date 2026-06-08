// T8 — Stats — retired; redirects to /settings/track (IRIS_TTRACK_ELEMENT_MAP)
// response_categories table was dropped in migration 0022.

import { redirect } from 'next/navigation'

export default function SettingsStatsPage() {
  redirect('/settings/track')
}
