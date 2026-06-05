/**
 * fix-switch-duplication.mjs
 *
 * Demo Church accumulated two active Switch templates from separate import runs:
 *   SWITCH_WED (d74131c9) — old import, has response_entries
 *   SWITCH     (1d4db139) — latest import, has attendance + volunteer
 *
 * All 28 dates overlap. This script:
 *   1. Moves SWITCH_WED response_entries to the matching SWITCH occurrence
 *   2. Deletes all remaining data on SWITCH_WED occurrences
 *   3. Deletes SWITCH_WED occurrences
 *   4. Deactivates the SWITCH_WED template
 *   5. Resets grid_config so History re-derives with one Switch group
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const CHURCH        = '4ea14bc0-ee4a-49fe-b905-ae7cfc37564e'
const SWITCH_WED_ID = 'd74131c9-e411-48ee-8f2b-f8d691dcbadb'  // old — deactivate
const SWITCH_ID     = '1d4db139-6ddf-441b-ba3a-cc38170c3457'  // keep

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const log  = msg => console.log(`  ${msg}`)
const sep  = lbl => console.log(`\n── ${lbl} ${'─'.repeat(50 - lbl.length)}`)

sep('Load occurrences')
const { data: wedOccs }    = await admin.from('service_occurrences').select('id, service_date').eq('service_template_id', SWITCH_WED_ID)
const { data: switchOccs } = await admin.from('service_occurrences').select('id, service_date').eq('service_template_id', SWITCH_ID)

const switchByDate = new Map(switchOccs.map(o => [o.service_date, o.id]))
const wedOccIds    = wedOccs.map(o => o.id)
log(`SWITCH_WED occs: ${wedOccs.length}`)
log(`SWITCH occs:     ${switchOccs.length}`)

sep('Move response_entries from SWITCH_WED → SWITCH')
let moved = 0
for (const wedOcc of wedOccs) {
  const switchOccId = switchByDate.get(wedOcc.service_date)
  if (!switchOccId) { log(`WARN: no SWITCH occ for ${wedOcc.service_date} — skipping`); continue }

  // Load response entries on old occurrence
  const { data: entries } = await admin
    .from('response_entries')
    .select('response_category_id, audience_group_code, stat_value, is_not_applicable, created_by')
    .eq('service_occurrence_id', wedOcc.id)

  if (!entries?.length) continue

  // Upsert to new occurrence (SWITCH already has none, but be safe)
  const toInsert = entries.map(e => ({
    service_occurrence_id: switchOccId,
    response_category_id:  e.response_category_id,
    audience_group_code:   e.audience_group_code,
    stat_value:            e.stat_value,
    is_not_applicable:     e.is_not_applicable,
    created_by:            e.created_by,
  }))

  const { error } = await admin.from('response_entries').upsert(toInsert, {
    onConflict: 'service_occurrence_id,response_category_id,audience_group_code',
  })
  if (error) { log(`ERROR moving responses for ${wedOcc.service_date}: ${error.message}`); continue }
  moved += entries.length
}
log(`Moved ${moved} response_entry rows`)

sep('Delete all data on SWITCH_WED occurrences')
const tables = ['attendance_entries', 'volunteer_entries', 'response_entries']
for (const tbl of tables) {
  const { count, error } = await admin.from(tbl)
    .delete({ count: 'exact' })
    .in('service_occurrence_id', wedOccIds)
  if (error) log(`ERROR deleting ${tbl}: ${error.message}`)
  else log(`Deleted ${count} rows from ${tbl}`)
}

sep('Delete SWITCH_WED occurrences')
const { count: delOccs, error: delOccErr } = await admin
  .from('service_occurrences')
  .delete({ count: 'exact' })
  .eq('service_template_id', SWITCH_WED_ID)
if (delOccErr) log(`ERROR: ${delOccErr.message}`)
else log(`Deleted ${delOccs} occurrences`)

sep('Deactivate SWITCH_WED template')
const { error: deactErr } = await admin
  .from('service_templates')
  .update({ is_active: false })
  .eq('id', SWITCH_WED_ID)
if (deactErr) log(`ERROR: ${deactErr.message}`)
else log('SWITCH_WED template deactivated')

sep('Reset grid_config so History re-derives')
const { error: gcErr } = await admin
  .from('churches')
  .update({ grid_config: null })
  .eq('id', CHURCH)
if (gcErr) log(`ERROR: ${gcErr.message}`)
else log('grid_config reset to NULL')

sep('Verify')
const { data: activeTmpls } = await admin
  .from('service_templates')
  .select('display_name, service_code, is_active')
  .eq('church_id', CHURCH)
  .order('sort_order')
for (const t of activeTmpls ?? []) log(`[${t.is_active ? 'active' : 'INACT'}] ${t.display_name} (${t.service_code})`)

const { count: switchOccCount } = await admin.from('service_occurrences').select('*', { count: 'exact', head: true }).eq('service_template_id', SWITCH_ID)
const { count: switchAttCount } = await admin.from('attendance_entries').select('*', { count: 'exact', head: true }).in('service_occurrence_id', (switchOccs ?? []).map(o => o.id))
log(`\nSWITCH now: ${switchOccCount} occurrences, ${switchAttCount} attendance rows`)

console.log('\n✓ Done\n')
