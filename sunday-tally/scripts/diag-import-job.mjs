/**
 * diag-import-job.mjs
 * Dumps the confirmed_mapping, stage_b_result, and errors for the most recent
 * completed import job on Demo Church (4ea14bc0).
 *
 * Run: node scripts/diag-import-job.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Find Demo Church created ~510 min ago (most recent "Demo Church" with done import)
const { data: churchRows } = await admin
  .from('churches')
  .select('id, name')
  .ilike('name', 'Demo Church%')
  .order('created_at', { ascending: false })
  .limit(5)

console.log('Demo churches found:', churchRows?.map(c => `${c.name} (${c.id})`).join(', '))

// Get the most recent completed job across all demo churches
const { data: jobs, error } = await admin
  .from('import_jobs')
  .select('*')
  .in('church_id', churchRows?.map(c => c.id) ?? [])
  .eq('status', 'done')
  .order('created_at', { ascending: false })
  .limit(1)

if (error) { console.error('Error:', error.message); process.exit(1) }
if (!jobs?.length) { console.log('No completed jobs found'); process.exit(0) }

const job = jobs[0]
console.log(`Job ID: ${job.id}`)
console.log(`Status: ${job.status}`)
console.log(`Created: ${job.created_at}`)
console.log()

// Stage B result
if (job.result_summary) {
  console.log('=== Stage B Result (result_summary) ===')
  console.log(JSON.stringify(job.result_summary, null, 2))
  console.log()
}

// All fields available
console.log('=== Job fields present ===')
console.log(Object.keys(job).filter(k => job[k] !== null && job[k] !== undefined).join(', '))
console.log()

// Confirmed mapping — column_map entries
const confirmed = job.confirmed_mapping
if (!confirmed) {
  console.log('No confirmed_mapping on this job — user may not have answered questions yet')
  process.exit(0)
}

console.log('=== Confirmed Sources ===')
for (const src of (confirmed.sources ?? [])) {
  console.log(`\nSource: "${src.source_name}" → ${src.dest_table}`)
  if (src.date_column) console.log(`  date_column: ${src.date_column}`)
  if (src.default_service_template_code) console.log(`  default_template: ${src.default_service_template_code}`)
  if (src.tall_format) {
    console.log(`  tall_format:`)
    console.log(`    metric_name_column: ${src.tall_format.metric_name_column}`)
    console.log(`    value_column: ${src.tall_format.value_column}`)
    if (src.tall_format.audience_column) console.log(`    audience_column: ${src.tall_format.audience_column}`)
    if (src.tall_format.area_field_map) {
      console.log(`    area_field_map:`)
      for (const [k, v] of Object.entries(src.tall_format.area_field_map)) {
        console.log(`      "${k}" → "${v}"`)
      }
    }
  }
  console.log(`  column_map:`)
  for (const c of (src.column_map ?? [])) {
    console.log(`    "${c.source_column}" → "${c.dest_field}"`)
  }
}

// Proposed setup
if (confirmed.proposed_setup) {
  console.log('\n=== Proposed Setup ===')
  console.log(JSON.stringify(confirmed.proposed_setup, null, 2))
}

// QA answers
if (confirmed.qa_answers?.length) {
  console.log('\n=== QA Answers ===')
  for (const qa of confirmed.qa_answers) {
    console.log(`  [${qa.id ?? '?'}] ${qa.question}`)
    console.log(`    → ${qa.answer}${qa.meaning_code ? ` (${qa.meaning_code})` : ''}`)
  }
}
