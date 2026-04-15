// T4_SUMMARY — /services/[occurrenceId]/stats/summary
// The post-submit summary (E6) is rendered as in-page state within T4 (stats/page.tsx).
// If this route is accessed directly (e.g. browser back), redirect to T1B.

import { redirect } from 'next/navigation'

interface Props {
  params: { occurrenceId: string }
}

export default function StatsSummaryPage({ params }: Props) {
  // Summary state lives inside T4 — redirect to occurrence dashboard
  redirect(`/services/${params.occurrenceId}`)
}
