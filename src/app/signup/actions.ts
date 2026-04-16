'use server'

// SIGNUP provisioning server action — D-051 compensation pattern
// Uses service role client (admin) for all steps — RLS blocks new user pre-membership
// Never expose service role key to client

import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface SignupData {
  churchName: string
  ownerName: string
  email: string
  password: string
}

export async function signupAction(data: SignupData): Promise<{ error: string } | never> {
  const admin = createServiceRoleClient()
  let userId: string | null = null
  let churchId: string | null = null

  // Step 1 — Create Auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    user_metadata: { full_name: data.ownerName },
    email_confirm: true,
  })

  if (authError) {
    console.error('SIGNUP ERROR (Auth):', authError)
    if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
      return { error: 'That email already has an account. Sign in instead.' }
    }
    return { error: 'Something went wrong. Try again.' }
  }

  userId = authData.user.id

  // Generate a basic unique slug since it's required by the schema
  const baseSlug = data.churchName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
  const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`

  // Step 2 — INSERT church
  const { data: church, error: churchError } = await admin
    .from('churches')
    .insert({ name: data.churchName, slug })
    .select('id')
    .single()

  if (churchError || !church) {
    console.error('SIGNUP ERROR (Church):', churchError)
    await admin.auth.admin.deleteUser(userId)
    return { error: 'Something went wrong. Try again.' }
  }

  churchId = church.id

  // Step 3 — INSERT default location
  const { error: locError } = await admin
    .from('church_locations')
    .insert({ church_id: churchId, name: 'Main Campus', code: 'MAIN', sort_order: 1 })

  if (locError) {
    console.error('SIGNUP ERROR (Location):', locError)
    await admin.from('churches').delete().eq('id', churchId)
    await admin.auth.admin.deleteUser(userId)
    return { error: 'Something went wrong. Try again.' }
  }

  // Step 4 — Seed defaults
  const seeds = [
    admin.rpc('seed_default_stat_categories', { p_church_id: churchId }),
    admin.rpc('seed_default_giving_sources', { p_church_id: churchId }),
    admin.rpc('seed_default_service_tags', { p_church_id: churchId }),
  ]
  const seedResults = await Promise.all(seeds)
  const seedError = seedResults.find(r => r.error)?.error

  if (seedError) {
    console.error('SIGNUP ERROR (Seeds):', seedError)
    await admin.from('churches').delete().eq('id', churchId)
    await admin.auth.admin.deleteUser(userId)
    return { error: 'Something went wrong. Try again.' }
  }

  // Step 5 — INSERT church_membership (owner)
  const { error: memberError } = await admin
    .from('church_memberships')
    .insert({ user_id: userId, church_id: churchId, role: 'owner', is_active: true })

  if (memberError) {
    console.error('SIGNUP ERROR (Member):', memberError)
    await admin.from('churches').delete().eq('id', churchId)
    await admin.auth.admin.deleteUser(userId)
    return { error: 'Something went wrong. Try again.' }
  }

  const supabase = await createClient()
  await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  redirect('/services')
}