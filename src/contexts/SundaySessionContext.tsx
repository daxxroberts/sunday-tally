'use client'

// SundaySessionContext — occurrence context written when user taps a service in T1.
// Persists across T1B, T2, T3, T4, T4_SUMMARY, T5.
// Keyed by date in sessionStorage: sunday_session_[YYYY-MM-DD]
// Restoration pointer: sunday_last_active
// If empty on T2–T5 load: redirect to T1. (D-017, HANDOFF_BRIEF)

import { createContext, useContext, useCallback } from 'react'
import type { SundaySession } from '@/types'

interface SundaySessionContextValue {
  session: SundaySession | null
  setSession: (session: SundaySession) => void
  clearSession: () => void
  restoreSession: (date: string) => SundaySession | null
}

const SundaySessionContext = createContext<SundaySessionContextValue | null>(null)

export function SundaySessionProvider({ children }: { children: React.ReactNode }) {
  const setSession = useCallback((session: SundaySession) => {
    const key = `sunday_session_${session.serviceDate}`
    sessionStorage.setItem(key, JSON.stringify(session))
    sessionStorage.setItem('sunday_last_active', session.serviceDate)
  }, [])

  const clearSession = useCallback(() => {
    const lastActive = sessionStorage.getItem('sunday_last_active')
    if (lastActive) {
      sessionStorage.removeItem(`sunday_session_${lastActive}`)
      sessionStorage.removeItem('sunday_last_active')
    }
  }, [])

  const restoreSession = useCallback((date: string): SundaySession | null => {
    const key = `sunday_session_${date}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as SundaySession
    } catch {
      return null
    }
  }, [])

  // Read session from sessionStorage based on the last active date
  const getSession = (): SundaySession | null => {
    if (typeof window === 'undefined') return null
    const lastActive = sessionStorage.getItem('sunday_last_active')
    if (!lastActive) return null
    return restoreSession(lastActive)
  }

  return (
    <SundaySessionContext.Provider
      value={{
        session: getSession(),
        setSession,
        clearSession,
        restoreSession,
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
