'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getUnscheduledTemplates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (\!user) return []

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (\!membership) return []

  // Templates with no active schedule version (N31b)
  const { data: templates } = await supabase
    .from('service_templates')
    .select('id, display_name')
    .eq('church_id', membership.church_id)
    .eq('is_active', true)
    .order('sort_order')

  if (\!templates) return []

  const unscheduled: { id: string; display_name: string }[] = []
  for (const t of templates) {
    const { data: active } = await supabase
      .from('service_schedule_versions')
      .select('id')
      .eq('service_template_id', t.id)
      .eq('is_active', true)
      .limit(1)
    if (\!active || active.length === 0) unscheduled.push(t)
  }
  return unscheduled
}

export async function saveScheduleAction(
  templateId: string,
  dayOfWeek: number,
  startTime: string,
  effectiveStartDate: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (\!user) return { error: 'Not authenticated' }

  // N29: set effective_end_date on any prior active version
  const today = new Date().toISOString().split('T')[0]
  await supabase
    .from('service_schedule_versions')
    .update({ effective_end_date: today, is_active: false })
    .eq('service_template_id', templateId)
    .eq('is_active', true)

  const { error } = await supabase
    .from('service_schedule_versions')
    .insert({
      service_template_id: templateId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      effective_start_date: effectiveStartDate,
      effective_end_date: null,
      is_active: true,
    })

  if (error) return { error: 'Failed to save schedule.' }
  revalidatePath('/onboarding/schedule')
  return {}
}
