/**
 * diag-churches.mjs
 * Shows all churches, their templates, occurrence counts, and grid_config status.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Get all churches
const { data: churches, error: churchErr } = await admin
  .from('churches')
  .select('id, name, slug, created_at, grid_config')
  .order('created_at', { ascending: false })

if (churchErr) { console.error('churches error:', churchErr.message); process.exit(1) }

console.log(`\nFound ${churches.length} church(es)\n`)

for (const church of churches) {
  const age = Math.round((Date.now() - new Date(church.created_at).getTime()) / 60000)
  console.log(`── ${church.name} (${church.id.slice(0, 8)}) — created ${age}m ago`)
  console.log(`   slug: ${church.slug}`)
  console.log(`   grid_config: ${church.grid_config ? 'SET (' + Object.keys(church.grid_config).join(', ') + ')' : 'null'}`)

  // Templates
  const { data: templates } = await admin
    .from('service_templates')
    .select('id, display_name, primary_tag_id, is_active')
    .eq('church_id', church.id)

  console.log(`   templates: ${templates?.length ?? 0}`)
  for (const t of templates ?? []) {
    console.log(`     • ${t.display_name} — active=${t.is_active} tag=${t.primary_tag_id ? t.primary_tag_id.slice(0,8) : 'NULL'}`)
  }

  // Occurrences
  const { count: occCount } = await admin
    .from('service_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', church.id)

  console.log(`   occurrences: ${occCount ?? 0}`)

  // Import jobs
  const { data: jobs } = await admin
    .from('import_jobs')
    .select('id, status, created_at, proposed_mapping')
    .eq('church_id', church.id)
    .order('created_at', { ascending: false })
    .limit(3)

  console.log(`   import_jobs: ${jobs?.length ?? 0}`)
  for (const j of jobs ?? []) {
    const jAge = Math.round((Date.now() - new Date(j.created_at).getTime()) / 60000)
    const hasMapping = !!j.proposed_mapping
    const qCount = j.proposed_mapping?.clarification_questions?.length ?? 0
    console.log(`     • ${j.id.slice(0,8)} status=${j.status} age=${jAge}m mapping=${hasMapping} questions=${qCount}`)
  }

  // Attendance entries
  const { count: attCount } = await admin
    .from('attendance_entries')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', church.id)

  // Giving entries
  const { count: givCount } = await admin
    .from('giving_entries')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', church.id)

  console.log(`   attendance_entries: ${attCount ?? 0}  giving_entries: ${givCount ?? 0}`)
  console.log()
}
