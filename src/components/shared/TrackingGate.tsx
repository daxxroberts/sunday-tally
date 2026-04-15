'use client'

// TrackingGate — checks church tracking flags before rendering a section.
// Used in: T1B, T3, T4, T5, D1, D2 (HANDOFF_BRIEF shared components)
// If the flag is off, renders null (section is hidden, not greyed).

import type { Church } from '@/types'

type TrackingFlag = 'tracks_volunteers' | 'tracks_responses' | 'tracks_giving'

interface TrackingGateProps {
  church: Pick<Church, TrackingFlag>
  flag: TrackingFlag
  children: React.ReactNode
}

export default function TrackingGate({ church, flag, children }: TrackingGateProps) {
  if (\!church[flag]) return null
  return <>{children}</>
}
