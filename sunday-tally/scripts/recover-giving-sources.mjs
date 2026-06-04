/**
 * recover-giving-sources.mjs
 * Reactivates orphaned giving sources for Demo Church (4ea14bc0).
 * Safe to re-run — skips sources that are already active.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Find the Demo Church that has orphaned (inactive) giving sources with data.
// There are two Demo Church instances — pick the one with inactive sources.
const { data: churches } = await admin
  .from('churches')
  .select('id, name')
  .eq('name', 'Demo Church')

if (!churches?.length) { console.error('Demo Church not found'); process.exit(1) }

// Pick the church that has inactive giving sources
let church = null
for (const c of churches) {
  const { data: inactive } = await admin
    .from('giving_sources')
    .select('id')
    .eq('church_id', c.id)
    .eq('is_active', false)
    .limit(1)
  if (inactive?.length) { church = c; break }
}

if (!church) { console.error('No church with inactive sources found'); process.exit(1) }
console.log(`\nChurch: ${church.name} (${church.id})\n`)

// Find all inactive sources that have data
const { data: sources } = await admin
  .from('giving_sources')
  .select('id, source_name, source_code, is_active')
  .eq('church_id', church.id)
  .eq('is_active', false)

const toReactivate = []
for (const src of sources ?? []) {
  const { count: pgCount } = await admin
    .from('church_period_giving')
    .select('*', { count: 'exact', head: true })
    .eq('giving_source_id', src.id)

  const { count: geCount } = await admin
    .from('giving_entries')
    .select('*', { count: 'exact', head: true })
    .eq('giving_source_id', src.id)

  if ((pgCount ?? 0) > 0 || (geCount ?? 0) > 0) {
    toReactivate.push({ ...src, pgCount, geCount })
  }
}

if (toReactivate.length === 0) {
  console.log('No orphaned sources with data found — nothing to do.')
  process.exit(0)
}

console.log(`Found ${toReactivate.length} inactive source(s) with data:\n`)
for (const src of toReactivate) {
  console.log(`  • ${src.source_name} (${src.source_code}) — ${src.pgCount} weekly rows, ${src.geCount} service rows`)
}

console.log('\nReactivating...\n')

for (const src of toReactivate) {
  const { error } = await admin
    .from('giving_sources')
    .update({ is_active: true })
    .eq('id', src.id)

  if (error) {
    console.error(`  ✗ ${src.source_name}: ${error.message}`)
  } else {
    console.log(`  ✓ ${src.source_name} reactivated`)
  }
}

console.log('\nDone. Reload the History page — all giving data should now be visible.\n')
