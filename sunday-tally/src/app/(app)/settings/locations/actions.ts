'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { resolveMember, isOwnerAdmin } from '@/lib/supabase/auth-helpers'
import { stripe, stripePriceId } from '@/lib/stripe/server'
import { revalidatePath } from 'next/cache'
import { getBillingStatus } from '@/lib/billing/status'

// Helper to sync the number of active campuses to the Stripe subscription.
async function syncStripeQuantity(churchId: string) {
  const sb = await createServiceRoleClient()
  const { data: church } = await sb.from('churches').select('stripe_subscription_id').eq('id', churchId).single()
  
  if (!church?.stripe_subscription_id) return // No active subscription or still on trial
  
  // Count active locations
  const { count } = await sb.from('church_locations')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .eq('is_active', true)
    
  if (count === null) return
  
  try {
    const s = stripe()
    const sub = await s.subscriptions.retrieve(church.stripe_subscription_id)
    const priceId = stripePriceId()
    const item = sub.items.data.find(i => i.price.id === priceId)
    if (item && item.quantity !== count) {
      await s.subscriptionItems.update(item.id, { quantity: count })
    }
  } catch (error) {
    console.error('[Stripe Sync] Failed to update location quantity for church:', churchId, error)
  }
}

export async function getBillingInfoAction() {
  const sb = await createClient()
  const caller = await resolveMember(sb)
  if (!caller.ok) return { error: 'Unauthorized' }
  const status = await getBillingStatus(sb, caller.member.churchId)
  return { status }
}

export async function addLocationAction(name: string, code: string, sortOrder: number) {
  const sb = await createClient()
  const caller = await resolveMember(sb)
  if (!caller.ok || !isOwnerAdmin(caller.member.role)) return { error: 'Unauthorized' }

  // Bypass RLS for guaranteed unique insert & consistent read
  const adminSb = await createServiceRoleClient()
  
  const { data, error } = await adminSb
    .from('church_locations')
    .insert({ church_id: caller.member.churchId, name, code, is_active: true, sort_order: sortOrder })
    .select('id, name, code, is_active, sort_order')
    .single()
    
  if (error) return { error: error.message }
  
  // Sync to Stripe
  await syncStripeQuantity(caller.member.churchId)
  
  return { data }
}

export async function updateLocationAction(id: string, name: string, code: string) {
  const sb = await createClient()
  const caller = await resolveMember(sb)
  if (!caller.ok || !isOwnerAdmin(caller.member.role)) return { error: 'Unauthorized' }

  const adminSb = await createServiceRoleClient()
  const { data, error } = await adminSb
    .from('church_locations')
    .update({ name, code })
    .eq('id', id)
    .eq('church_id', caller.member.churchId)
    .select('id, name, code, is_active, sort_order')
    .single()
    
  if (error) return { error: error.message }
  
  // Sync to Stripe since active count changed
  await syncStripeQuantity(caller.member.churchId)
  
  return { data }
}

export async function toggleLocationActiveAction(locationId: string, isActive: boolean) {
  const sb = await createClient()
  const caller = await resolveMember(sb)
  if (!caller.ok || !isOwnerAdmin(caller.member.role)) return { error: 'Unauthorized' }

  const adminSb = await createServiceRoleClient()
  const { error } = await adminSb
    .from('church_locations')
    .update({ is_active: isActive })
    .eq('id', locationId)
    .eq('church_id', caller.member.churchId)
    
  if (error) return { error: error.message }
  
  // Sync to Stripe since active count changed
  await syncStripeQuantity(caller.member.churchId)
  
  return { success: true }
}

export async function deleteLocationAction(id: string) {
  const sb = await createClient()
  const caller = await resolveMember(sb)
  if (!caller.ok || !isOwnerAdmin(caller.member.role)) return { error: 'Unauthorized' }

  const adminSb = await createServiceRoleClient()
  
  const { data, error: fetchErr } = await adminSb
    .from('church_locations')
    .select('service_templates(id), service_instances(id)')
    .eq('id', id)
    .eq('church_id', caller.member.churchId)
    
  if (fetchErr) return { error: fetchErr.message }
  if (data) {
    for (const d of data) {
      if (d.service_templates?.length)
        return { error: 'Cannot delete location: ' + d.service_templates.length + ' service templates are linked to it.' }
      if (d.service_instances?.length)
        return { error: 'Cannot delete location: ' + d.service_instances.length + ' service instances are linked to it.' }
    }
  }

  const { error } = await adminSb
    .from('church_locations')
    .delete()
    .eq('id', id)
    .eq('church_id', caller.member.churchId)
    
  if (error) return { error: error.message }
  
  // Sync to Stripe
  await syncStripeQuantity(caller.member.churchId)
  
  return { success: true }
}

export async function checkLocationDataAction(locationId: string) {
  const sb = await createClient()
  const caller = await resolveMember(sb)
  if (!caller.ok || !isOwnerAdmin(caller.member.role)) return { error: 'Unauthorized' }

  const adminSb = await createServiceRoleClient()
  const [tmplCheck, entryCheck, instCheck] = await Promise.all([
    adminSb.from('service_templates').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
    adminSb.from('metric_entries').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
    adminSb.from('service_instances').select('id', { count: 'exact', head: true }).eq('location_id', locationId)
  ])
  
  const hasData = (tmplCheck.count && tmplCheck.count > 0) || 
                  (entryCheck.count && entryCheck.count > 0) || 
                  (instCheck.count && instCheck.count > 0)
  return { hasData }
}
