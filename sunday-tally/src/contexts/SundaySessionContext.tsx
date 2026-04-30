'use client'

// SundaySessionContext — occurrence context written when user taps a service in T1.
// Persists across T1B, T2, T3, T4, T4_SUMMARY, T5.
// Keyed by date in sessionStorage: sunday_session_[YYYY-MM-DD]
// Restoration pointer: sunday_last_active
// If empty on T2–T5 load: redirect to T1. (D-017, HANDOFF_BRIEF)

import { createContext, useContext, useCallback, useState } from 'react'
import type { SundaySession } from '@/types'

interface SundaySessionContextValue {
  session: SundaySession | null
  setSession: (session: SundaySession) => void
  clearSession: () => void
  restoreSession: (date: string) => SundaySession | null
  refetchTick: number
  notifyRefetch: () => void
}

const SundaySessionContext = createContext<SundaySessionContextValue | null>(null)

export function SundaySessionProvider({ children }: { children: React.ReactNode }) {
  const setSession = useCallback((session: SundaySession) => {
    const key = `sunday_session_${session.occurrenceId}`
    sessionStorage.setItem(key, JSON.stringify(session))
    sessionStorage.setItem('sunday_last_active_id', session.occurrenceId)
  }, [])

  const clearSession = useCallback(() => {
    const lastActiveId = sessionStorage.getItem('sunday_last_active_id')
    if (lastActiveId) {
      sessionStorage.removeItem(`sunday_session_${lastActiveId}`)
      sessionStorage.removeItem('sunday_last_active_id')
    }
  }, [])

  const restoreSession = useCallback((occurrenceId: string): SundaySession | null => {
    const key = `sunday_session_${occurrenceId}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as SundaySession
    } catch {
      return null
    }
  }, [])

  // Read session from sessionStorage based on the last active occurrence ID
  const getSession = (id?: string): SundaySession | null => {
    if (typeof window === 'undefined') return null
    const targetId = id || sessionStorage.getItem('sunday_last_active_id')
    if (!targetId) return null
    return restoreSession(targetId)
  }

  const [refetchTick, setRefetchTick] = useState(0)
  const notifyRefetch = useCallback(() => {
    setRefetchTick(prev => prev + 1)
  }, [])

  return (
    <SundaySessionContext.Provider
      value={{
        session: null, // Component-level restoration is preferred to avoid stale state in header
        setSession,
        clearSession,
        restoreSession,
        refetchTick,
        notifyRefetch,
      }}
    >
      {children}
    </SundaySessionContext.Provider>
  )
}

export function useSundaySession() {
  const ctx = useContext(SundaySessionContext)
  if (!ctx) {
    throw new Error('useSundaySession must be used within SundaySessionProvider')
  }
  return ctx
}
