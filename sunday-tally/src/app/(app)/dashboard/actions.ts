'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveMember } from '@/lib/supabase/auth-helpers'
import { getEntitlements } from '@/lib/billing/entitlements'

export async function getDashboardEntitlementsAction() {
  const sb = await createClient()
  const caller = await resolveMember(sb)
  if (!caller.ok) return { error: 'Unauthorized' }
  const entitlements = await getEntitlements(sb, caller.member.churchId)
  return { entitlements }
}
