import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Get all churches
const { data: churches } = await admin.from('churches').select('id, name').order('name')

for (const church of churches ?? []) {
  const { data: sources } = await admin
    .from('giving_sources')
    .select('id, source_name, source_code, is_active')
    .eq('church_id', church.id)
    .order('is_active', { ascending: false })
    .order('source_name')

  if (!sources?.length) continue

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`${church.name} (${church.id.slice(0, 8)})`)
  console.log(`${'─'.repeat(60)}`)

  for (const src of sources) {
    // Count giving_entries rows
    const { count: geCount } = await admin
      .from('giving_entries')
      .select('*', { count: 'exact', head: true })
      .eq('giving_source_id', src.id)

    // Sum giving_entries amount
    const { data: geSum } = await admin
      .from('giving_entries')
      .select('giving_amount')
      .eq('giving_source_id', src.id)

    const serviceTotalRaw = (geSum ?? []).reduce((acc, r) => acc + Number(r.giving_amount ?? 0), 0)

    // Count church_period_giving rows
    const { count: pgCount } = await admin
      .from('church_period_giving')
      .select('*', { count: 'exact', head: true })
      .eq('giving_source_id', src.id)

    // Sum church_period_giving amount
    const { data: pgSum } = await admin
      .from('church_period_giving')
      .select('giving_amount')
      .eq('giving_source_id', src.id)

    const weeklyTotalRaw = (pgSum ?? []).reduce((acc, r) => acc + Number(r.giving_amount ?? 0), 0)

    const status    = src.is_active ? '✓ active  ' : '✗ INACTIVE'
    const hasData   = (geCount ?? 0) > 0 || (pgCount ?? 0) > 0
    const orphaned  = !src.is_active && hasData ? ' ← ORPHANED DATA' : ''

    console.log(
      `  [${status}] ${src.source_name.padEnd(30)} (${src.source_code})\n` +
      `             service rows: ${String(geCount ?? 0).padStart(4)}   service $: ${serviceTotalRaw.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n` +
      `             weekly rows:  ${String(pgCount ?? 0).padStart(4)}   weekly $:  ${weeklyTotalRaw.toLocaleString('en-US', { minimumFractionDigits: 2 })}${orphaned}`
    )
  }
}

console.log('\n')
