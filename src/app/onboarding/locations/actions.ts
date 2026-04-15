'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveLocationsAction(
  locations: { id: string | null; name: string; sort_order: number }[]
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (\!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (\!membership) return { error: 'No church found' }
  const churchId = membership.church_id

  for (const loc of locations) {
    if (loc.id) {
      // Update existing
      const { error } = await supabase
        .from('church_locations')
        .update({ name: loc.name.trim(), sort_order: loc.sort_order })
        .eq('id', loc.id)
        .eq('church_id', churchId)
      if (error) return { error: 'Failed to save location.' }
    } else {
      // Insert new
      const { error } = await supabase
        .from('church_locations')
        .insert({ church_id: churchId, name: loc.name.trim(), sort_order: loc.sort_order })
      if (error) return { error: 'Failed to add location.' }
    }
  }

  revalidatePath('/onboarding/locations')
  return {}
}

export async function deleteLocationAction(locationId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (\!user) return { error: 'Not authenticated' }

  // Check for service_templates references (N26)
  const { data: refs } = await supabase
    .from('service_templates')
    .select('id')
    .eq('location_id', locationId)
    .eq('is_active', true)
    .limit(1)

  if (refs && refs.length > 0) {
    return { error: 'This location has active services. Remove the services first.' }
  }

  const { error } = await supabase
    .from('church_locations')
    .delete()
    .eq('id', locationId)

  if (error) return { error: 'Failed to remove location.' }
  revalidatePath('/onboarding/locations')
  return {}
}
