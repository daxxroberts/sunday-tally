'use server'

// Settings hub server actions.

import { createClient } from '@/lib/supabase/server'
import { resolveMember } from '@/lib/supabase/auth-helpers'

/**
 * Reset all church DATA (locations, services, metrics, entries, widgets) while
 * keeping the church row and the owner's login — so they can start over and
 * re-import. Owner-only, enforced here AND inside the SECURITY DEFINER
 * reset_church_data() function (which also re-seeds reporting tags, a default
 * Main Campus, and the starter widgets).
 */
export async function resetChurchData(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const resolved = await resolveMember(supabase)
  if (!resolved.ok) return { ok: false, error: 'Please sign in again.' }
  if (resolved.member.role !== 'owner') {
    return { ok: false, error: 'Only the church owner can reset church data.' }
  }

  const { error } = await supabase.rpc('reset_church_data', {
    p_church_id: resolved.member.churchId,
  })
  if (error) {
    console.error('RESET CHURCH ERROR:', error)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
  return { ok: true }
}
