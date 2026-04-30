'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signInWithPasswordAction(email: string, password: string): Promise<{ error: string } | never> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.includes('Invalid login credentials') || error.message.includes('invalid_credentials')) {
      return { error: "That email and password don't match. Try again." }
    }
    if (error.message.includes('Email not confirmed')) {
      return { error: "Check your email and confirm your address before signing in." }
    }
    return { error: 'Something went wrong. Check your connection and try again.' }
  }

  // Read role to route correctly (E6)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Something went wrong. Try again.' }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  const role = membership?.role
  if (role === 'viewer') redirect('/dashboard/viewer')
  redirect('/services')
}

export async function sendMagicLinkAction(email: string): Promise<{ error?: string; sent?: boolean }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },  // Viewer re-auth — membership already exists (D-048)
  })

  if (error) {
    return { error: 'Something went wrong. Check your connection and try again.' }
  }

  return { sent: true }
}
