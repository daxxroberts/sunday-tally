'use server'

import { createServiceRoleClient, createClient } from '@/lib/supabase/server'

async function getChurchId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  return data?.church_id ?? null
}

export async function selectTemplate1Action(): Promise<{ error?: string }> {
  const churchId = await getChurchId()
  if (!churchId) return { error: 'Not signed in.' }
  const admin = createServiceRoleClient()
  const { error } = await admin.rpc('seed_starter_church_setup', { p_church_id: churchId })
  if (error) {
    console.error('TEMPLATE1 SEED ERROR:', error)
    return { error: 'Could not apply template. Try again.' }
  }
  return {}
}

export async function selectTemplate2Action(): Promise<{ error?: string }> {
  const churchId = await getChurchId()
  if (!churchId) return { error: 'Not signed in.' }
  const admin = createServiceRoleClient()
  const { error } = await admin.rpc('seed_template2_church_setup', { p_church_id: churchId })
  if (error) {
    console.error('TEMPLATE2 SEED ERROR:', error)
    return { error: 'Could not apply template. Try again.' }
  }
  return {}
}
