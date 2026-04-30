/**
 * reset-demo-church.mjs
 *
 * Wipes the Demo Church's data tables (templates, occurrences, entries,
 * schedule versions, locations, tags, categories, sources, period tables)
 * while keeping the church + owner membership intact, so the AI import flow
 * can be re-run from a clean slate.
 *
 * Usage: node scripts/reset-demo-church.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath   = resolve(__dirname, '../.env.local')
const envRaw    = readFileSync(envPath, 'utf8')
const env       = Object.fromEntries(
  envRaw.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).map(l => {
    const eq = l.indexOf('=')
    return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]
  })
)

const SUPABASE_URL     = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const DEMO_EMAIL = 'demo@sundaytally.dev'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log('\n── SundayTally Demo Reset ────────────────────────────')

// Resolve user + church
const { data: list } = await admin.auth.admin.listUsers()
const user = list?.users?.find(u => u.email === DEMO_EMAIL)
if (!user) { console.error('Demo user not found. Run seed-demo-church.mjs first.'); process.exit(1) }

const { data: membership } = await admin
  .from('church_memberships')
  .select('church_id')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .maybeSingle()
if (!membership) { console.error('No church membership found for demo user.'); process.exit(1) }
const churchId = membership.church_id
console.log(`User: ${user.id}\nChurch: ${churchId}\n`)

// Helper: delete all rows of `table` for this church (or by joined occurrence)
async function wipeByChurch(table) {
  const { error, count } = await admin
    .from(table)
    .delete({ count: 'exact' })
    .eq('church_id', churchId)
  if (error) console.warn(`  ${table}: ${error.message}`)
  else        console.log(`  ${table}: ${count ?? 0} rows`)
}

// Chunk an IN list so the URL doesn't exceed PostgREST limits.
async function deleteByIdChunked(table, fkColumn, ids) {
  const CHUNK = 40
  let total = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error, count } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .in(fkColumn, chunk)
    if (error) { console.warn(`  ${table} (chunk ${i / CHUNK}): ${error.message}`); return }
    total += count ?? 0
  }
  console.log(`  ${table}: ${total} rows`)
}

// For tables that don't carry church_id directly — delete via parent IDs.
async function wipeByOccurrence() {
  const { data: occs } = await admin
    .from('service_occurrences')
    .select('id')
    .eq('church_id', churchId)
  const ids = (occs ?? []).map(o => o.id)
  if (ids.length === 0) {
    console.log('  attendance/giving/volunteer/response_entries: 0 occurrences, skipping')
    return
  }
  for (const t of ['attendance_entries', 'giving_entries', 'volunteer_entries', 'response_entries']) {
    await deleteByIdChunked(t, 'service_occurrence_id', ids)
  }
}

async function wipeScheduleVersions() {
  const { data: tmpl } = await admin
    .from('service_templates')
    .select('id')
    .eq('church_id', churchId)
  const ids = (tmpl ?? []).map(t => t.id)
  if (ids.length === 0) {
    console.log('  service_schedule_versions: 0 templates, skipping')
    return
  }
  await deleteByIdChunked('service_schedule_versions', 'service_template_id', ids)
}

async function wipeOccurrenceTags() {
  const { data: occs } = await admin
    .from('service_occurrences')
    .select('id')
    .eq('church_id', churchId)
  const ids = (occs ?? []).map(o => o.id)
  if (ids.length === 0) return
  await deleteByIdChunked('service_occurrence_tags', 'service_occurrence_id', ids)
}

async function wipeTemplateTags() {
  const { data: tmpl } = await admin
    .from('service_templates')
    .select('id')
    .eq('church_id', churchId)
  const ids = (tmpl ?? []).map(t => t.id)
  if (ids.length === 0) return
  await deleteByIdChunked('service_template_tags', 'service_template_id', ids)
}

console.log('Wiping data (children first):')

// 1. Entries (must go before occurrences)
await wipeByOccurrence()

// 2. Period tables (no occurrence dependency)
await wipeByChurch('church_period_giving')
await wipeByChurch('church_period_entries')

// 3. Junction tables for occurrences/templates
await wipeOccurrenceTags()
await wipeTemplateTags()

// 4. Schedule versions (must go before templates)
await wipeScheduleVersions()

// 5. Occurrences (must go before templates)
await wipeByChurch('service_occurrences')

// 6. Templates (must go before locations, tags, categories)
await wipeByChurch('service_templates')

// 7. Categories + sources
await wipeByChurch('volunteer_categories')
await wipeByChurch('response_categories')
await wipeByChurch('giving_sources')

// 8. Tags (must go after templates that referenced them)
await wipeByChurch('service_tags')

// 9. Locations (must go last among church-scoped reference data)
await wipeByChurch('church_locations')

console.log(`
────────────────────────────────────────────────────
  ✓ Demo church data cleared. User + church + membership intact.

  Next step:
    1. Open  http://localhost:3000/onboarding/import
    2. Paste the workbook URL:
       https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit
    3. Stop when the clarification questions appear — do NOT confirm.
────────────────────────────────────────────────────
`)
