/**
 * Quick diagnostic: show what church_period_giving actually contains for the demo church.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: list } = await admin.auth.admin.listUsers()
const user = list?.users?.find(u => u.email === 'demo@sundaytally.dev')
const { data: m } = await admin
  .from('church_memberships')
  .select('church_id')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .maybeSingle()
const churchId = m.church_id

console.log('Church ID:', churchId)
console.log()

// Total counts
const { count: pgCount } = await admin
  .from('church_period_giving')
  .select('id', { count: 'exact', head: true })
  .eq('church_id', churchId)
console.log(`church_period_giving rows: ${pgCount}`)

const { count: gCount } = await admin
  .from('giving_entries')
  .select('id', { count: 'exact', head: true })
console.log(`giving_entries rows (service-level): ${gCount}`)
console.log()

// Recent 4 weeks of period giving
console.log('=== Latest 4 weeks of period_giving ===')
const { data: recent } = await admin
  .from('church_period_giving')
  .select('period_date, giving_amount, giving_sources(source_name)')
  .eq('church_id', churchId)
  .eq('entry_period_type', 'week')
  .order('period_date', { ascending: false })
  .limit(40)

const byWeek = {}
for (const r of recent ?? []) {
  if (!byWeek[r.period_date]) byWeek[r.period_date] = []
  byWeek[r.period_date].push({ src: r.giving_sources?.source_name, amt: Number(r.giving_amount) })
}
for (const [week, entries] of Object.entries(byWeek).slice(0, 4)) {
  const total = entries.reduce((s, e) => s + e.amt, 0)
  console.log(`\n${week}  (${entries.length} sources, total $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}):`)
  for (const e of entries) console.log(`  ${(e.src ?? '?').padEnd(20)} $${e.amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
}

// Source totals across all time
console.log('\n=== Total by source (all time) ===')
const { data: all } = await admin
  .from('church_period_giving')
  .select('giving_amount, giving_sources(source_name)')
  .eq('church_id', churchId)
  .eq('entry_period_type', 'week')
const totals = {}
for (const r of all ?? []) {
  const k = r.giving_sources?.source_name ?? '?'
  totals[k] = (totals[k] ?? 0) + Number(r.giving_amount)
}
for (const [k, v] of Object.entries(totals).sort(([,a], [,b]) => b - a)) {
  console.log(`  ${k.padEnd(20)} $${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
}
