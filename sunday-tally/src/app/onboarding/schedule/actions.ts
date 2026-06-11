'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getUnscheduledTemplates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!membership) return []

  // Templates with no active schedule version (N31b)
  const { data: templates } = await supabase
    .from('service_templates')
    .select('id, display_name')
    .eq('church_id', membership.church_id)
    .eq('is_active', true)
    .order('sort_order')

  if (!templates) return []

  const unscheduled: { id: string; display_name: string }[] = []
  for (const t of templates) {
    const { data: active } = await supabase
      .from('service_schedule_versions')
      .select('id')
      .eq('service_template_id', t.id)
      .eq('is_active', true)
      .limit(1)
    if (!active || active.length === 0) unscheduled.push(t)
  }
  return unscheduled
}

export type ScheduleFrequency = 'specific' | 'weekly' | 'monthly'

export async function saveScheduleAction(
  templateId: string,
  dayOfWeek: number,
  startTime: string,
  effectiveStartDate: string,
  frequency: ScheduleFrequency = 'specific',
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // N29: set effective_end_date on any prior active version
  const today = new Date().toISOString().split('T')[0]
  await supabase
    .from('service_schedule_versions')
    .update({ effective_end_date: today, is_active: false })
    .eq('service_template_id', templateId)
    .eq('is_active', true)

  // Weekly / monthly occurrences have no clock; day_of_week + start_time stay
  // NOT NULL, so write harmless placeholders the cadence makes us ignore.
  const isClocked = frequency === 'specific'
  const row = {
    service_template_id: templateId,
    day_of_week: isClocked ? dayOfWeek : 0,
    start_time:  isClocked ? startTime : '00:00',
    effective_start_date: effectiveStartDate,
    effective_end_date: null,
    is_active: true,
  }
  const conflict = { onConflict: 'service_template_id,effective_start_date' }

  // Upsert WITH frequency. If the column isn't migrated yet (0041), Postgres
  // rejects the unknown column — fall back to a frequency-less write so the
  // existing 'set day & time' flow keeps working until the migration lands.
  let { error } = await supabase
    .from('service_schedule_versions')
    .upsert({ ...row, frequency }, conflict)

  if (error && /frequency/i.test(error.message)) {
    ({ error } = await supabase
      .from('service_schedule_versions')
      .upsert(row, conflict))
  }

  if (error) return { error: `Failed to save schedule: ${error.message}` }
  revalidatePath('/onboarding/schedule')
  return {}
}
