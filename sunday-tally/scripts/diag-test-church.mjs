/**
 * diag-test-church.mjs
 * Full diagnostic for the test church import run.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'
const CHURCH_ID    = '016c8979-87a3-4c6a-bb23-9de33b068f64'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const sep = (label) => console.log(`\n${'═'.repeat(60)}\n  ${label}\n${'═'.repeat(60)}`)

// ── Church ────────────────────────────────────────────────────
sep('CHURCH')
const { data: church } = await admin.from('churches').select('*').eq('id', CHURCH_ID).single()
console.log(church)

// ── Import Jobs ───────────────────────────────────────────────
sep('IMPORT JOBS')
const { data: jobs } = await admin
  .from('import_jobs')
  .select('id, status, error, created_at, updated_at, sources->free_text, proposed_mapping, confirmed_mapping, result_summary')
  .eq('church_id', CHURCH_ID)
  .order('created_at', { ascending: false })

if (!jobs?.length) {
  console.log('  No import jobs found.')
} else {
  for (const job of jobs) {
    console.log(`\nJob: ${job.id}`)
    console.log(`  status:     ${job.status}`)
    console.log(`  error:      ${job.error ?? 'none'}`)
    console.log(`  created_at: ${job.created_at}`)
    console.log(`  updated_at: ${job.updated_at}`)
    if (job.proposed_mapping) {
      const pm = job.proposed_mapping
      console.log(`  proposed_mapping keys: ${Object.keys(pm).join(', ')}`)
      if (pm.questions?.length) {
        console.log(`  questions (${pm.questions.length}):`)
        for (const q of pm.questions) console.log(`    · ${q.id}: ${q.question}`)
      }
      if (pm.service_templates?.length) {
        console.log(`  service_templates proposed (${pm.service_templates.length}):`)
        for (const t of pm.service_templates) console.log(`    · ${t.display_name} (${t.service_code}) dow=${t.day_of_week}`)
      }
      if (pm.giving_sources?.length) {
        console.log(`  giving_sources proposed (${pm.giving_sources.length}):`)
        for (const s of pm.giving_sources) console.log(`    · ${s.source_name} (${s.source_code})`)
      }
    }
    if (job.result_summary) {
      console.log(`  result_summary:`, JSON.stringify(job.result_summary, null, 2))
    }
  }
}

// ── Service Templates ─────────────────────────────────────────
sep('SERVICE TEMPLATES')
const { data: templates } = await admin
  .from('service_templates')
  .select('id, display_name, service_code, is_active, sort_order, primary_tag_id')
  .eq('church_id', CHURCH_ID)
  .order('sort_order')
if (!templates?.length) { console.log('  None.') }
else for (const t of templates) console.log(`  [${t.is_active ? 'active' : 'INACTIVE'}] ${t.display_name} (${t.service_code}) tag=${t.primary_tag_id ?? 'NONE'}`)

// ── Service Occurrences ────────────────────────────────────────
sep('SERVICE OCCURRENCES (sample — last 5)')
const { data: occs, count: occCount } = await admin
  .from('service_occurrences')
  .select('id, service_template_id, service_date, status', { count: 'exact' })
  .eq('church_id', CHURCH_ID)
  .order('service_date', { ascending: false })
  .limit(5)
console.log(`  Total: ${occCount ?? 0}`)
if (occs?.length) for (const o of occs) console.log(`  ${o.service_date}  status=${o.status}  tmpl=${o.service_template_id}`)

// ── Giving Sources ─────────────────────────────────────────────
sep('GIVING SOURCES')
const { data: sources } = await admin
  .from('giving_sources')
  .select('id, source_name, source_code, is_active, display_order')
  .eq('church_id', CHURCH_ID)
  .order('display_order')
if (!sources?.length) { console.log('  None.') }
else for (const s of sources) console.log(`  [${s.is_active ? 'active' : 'INACTIVE'}] ${s.source_name} (${s.source_code}) order=${s.display_order}`)

// ── Giving Entries ─────────────────────────────────────────────
sep('GIVING ENTRIES')
const { count: geCount } = await admin
  .from('giving_entries')
  .select('*', { count: 'exact', head: true })
  .eq('church_id', CHURCH_ID)
console.log(`  Total rows: ${geCount ?? 0}`)

// ── Period Giving ──────────────────────────────────────────────
sep('CHURCH PERIOD GIVING')
const { count: pgCount } = await admin
  .from('church_period_giving')
  .select('*', { count: 'exact', head: true })
  .eq('church_id', CHURCH_ID)
console.log(`  Total rows: ${pgCount ?? 0}`)

// ── Attendance Entries ─────────────────────────────────────────
sep('ATTENDANCE ENTRIES')
const { count: attCount } = await admin
  .from('attendance_entries')
  .select('*', { count: 'exact', head: true })
  .in('service_occurrence_id', (occs ?? []).map(o => o.id))
console.log(`  Total rows (for sampled occs): ${attCount ?? 0}`)

// ── Locations ─────────────────────────────────────────────────
sep('LOCATIONS')
const { data: locs } = await admin
  .from('church_locations')
  .select('id, location_name, is_active')
  .eq('church_id', CHURCH_ID)
if (!locs?.length) { console.log('  None.') }
else for (const l of locs) console.log(`  [${l.is_active ? 'active' : 'INACTIVE'}] ${l.location_name}`)

// ── Tags ───────────────────────────────────────────────────────
sep('SERVICE TAGS (seeded for church)')
const { data: tags } = await admin
  .from('service_tags')
  .select('tag_code, tag_label, is_active')
  .eq('church_id', CHURCH_ID)
if (!tags?.length) { console.log('  None — no tags seeded.') }
else for (const t of tags) console.log(`  [${t.is_active ? 'active' : 'INACTIVE'}] ${t.tag_code}: ${t.tag_label}`)

console.log('\n')
