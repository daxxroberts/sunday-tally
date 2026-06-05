/**
 * diag-user-church.mjs
 * Finds the church associated with daxxroberts@gmail.com
 * and shows full state.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Find the user
const { data: users } = await admin.auth.admin.listUsers()
const user = users?.users?.find(u => u.email === 'daxxroberts@gmail.com')
if (!user) {
  console.log('User daxxroberts@gmail.com not found in auth.users')
  process.exit(1)
}
console.log(`User: ${user.email} (${user.id})`)

// Find their memberships
const { data: memberships } = await admin
  .from('church_memberships')
  .select('church_id, role, is_active')
  .eq('user_id', user.id)

console.log(`Memberships: ${memberships?.length ?? 0}`)
for (const m of memberships ?? []) {
  console.log(`  church: ${m.church_id} role=${m.role} active=${m.is_active}`)
}

if (!memberships?.length) {
  console.log('No memberships found — user has no church association')
  process.exit(0)
}

for (const m of memberships ?? []) {
  const { data: church } = await admin
    .from('churches')
    .select('*')
    .eq('id', m.church_id)
    .single()

  console.log(`\n── Church: ${church?.name} (${church?.id})`)
  console.log(`   grid_config: ${church?.grid_config ? 'SET' : 'null'}`)
  console.log(`   tracks_main: ${church?.tracks_main_attendance}, kids: ${church?.tracks_kids_attendance}, youth: ${church?.tracks_youth_attendance}`)

  const { data: templates } = await admin
    .from('service_templates')
    .select('id, display_name, service_code, primary_tag_id, is_active')
    .eq('church_id', m.church_id)

  console.log(`\n   Templates (${templates?.length ?? 0}):`)
  for (const t of templates ?? []) {
    console.log(`     • ${t.display_name} [${t.service_code}] active=${t.is_active} tag=${t.primary_tag_id ? t.primary_tag_id.slice(0,8) : 'NULL'}`)
  }

  const { data: occSample } = await admin
    .from('service_occurrences')
    .select('id, service_date, status')
    .eq('church_id', m.church_id)
    .order('service_date', { ascending: false })
    .limit(3)

  const { count: totalOcc } = await admin
    .from('service_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', m.church_id)

  console.log(`\n   Occurrences: ${totalOcc ?? 0} total`)
  for (const o of occSample ?? []) {
    console.log(`     • ${o.service_date} status=${o.status}`)
  }

  // Check attendance entries via occurrences
  if (occSample?.length) {
    const { count: attCount } = await admin
      .from('attendance_entries')
      .select('id', { count: 'exact', head: true })
      .in('service_occurrence_id', occSample.map(o => o.id))
    console.log(`\n   Attendance entries (sample of ${occSample.length} occs): ${attCount ?? 0}`)
  }

  const { data: jobs } = await admin
    .from('import_jobs')
    .select('id, status, created_at')
    .eq('church_id', m.church_id)
    .order('created_at', { ascending: false })

  console.log(`\n   Import jobs (${jobs?.length ?? 0}):`)
  for (const j of jobs ?? []) {
    console.log(`     • ${j.id.slice(0,8)} status=${j.status}`)
  }
}
