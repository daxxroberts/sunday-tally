/**
 * import-harbor-wide.mjs
 *
 * Test import for Harbor Community Church — wide format, fresh church,
 * deliberately different naming conventions from Demo Church:
 *   - Services named "AM" and "PM" (not numeric codes)
 *   - Kids ministry branded "KidZone" (no "kids" token in volunteer role names)
 *   - Giving sources use church-specific names ("Plate", "eGiving")
 *   - No youth ministry — tests that SWITCH group is NOT created
 *   - Volunteers: "Greeters", "Parking Crew", "Worship Team", "KidZone Helpers"
 *
 * Stress cases exercised:
 *   - Column names with no standard tokens (KidZone Helpers → should route to kids)
 *   - AM/PM service codes (not MORNING/EVENING, not 1/2)
 *   - Giving source names that don't look like industry standard terms
 *   - 6 months of data (enough for HIGH confidence)
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath   = resolve(__dirname, '../.env.local')
const envRaw    = readFileSync(envPath, 'utf8')
const env       = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()] })
)

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const ANON_KEY     = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const APP_URL      = env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

const EMAIL    = 'demo@sundaytally.dev'
const PASSWORD = 'SundayTally123!'

// ── Wide-format CSV: one row per service per Sunday ──────────────────────────
// Services: AM (9am) and PM (11am)
// Columns use Harbor's own language, not industry-standard terms

const HARBOR_CSV = `Date,Service,Adult Attenders,KidZone Attenders,Greeters,Parking Crew,Worship Team,KidZone Helpers,Plate,eGiving
2024-11-03,AM,312,87,8,6,14,9,2840.00,4210.50
2024-11-03,PM,198,54,5,4,14,6,1620.00,2890.75
2024-11-10,AM,298,91,7,6,14,10,3100.00,3980.25
2024-11-10,PM,201,60,5,4,14,7,1540.00,2760.00
2024-11-17,AM,325,95,8,7,15,11,2950.00,4320.00
2024-11-17,PM,210,58,5,4,15,7,1710.00,3010.50
2024-11-24,AM,289,82,7,5,14,9,2680.00,3870.25
2024-11-24,PM,187,51,4,4,14,6,1480.00,2640.00
2024-12-01,AM,318,89,8,6,14,10,3050.00,4180.75
2024-12-01,PM,205,56,5,4,14,7,1590.00,2920.00
2024-12-08,AM,330,93,9,7,15,11,3200.00,4450.00
2024-12-08,PM,215,62,6,5,15,8,1680.00,3100.25
2024-12-15,AM,341,98,9,7,15,12,3380.00,4620.50
2024-12-15,PM,222,67,6,5,15,8,1790.00,3240.00
2024-12-22,AM,298,84,8,6,14,10,2910.00,4050.75
2024-12-22,PM,196,55,5,4,14,7,1530.00,2800.00
2024-12-29,AM,275,78,7,5,13,9,2640.00,3780.25
2024-12-29,PM,182,49,4,3,13,6,1420.00,2560.00
2025-01-05,AM,308,86,8,6,14,10,2990.00,4150.50
2025-01-05,PM,199,57,5,4,14,7,1560.00,2840.75
2025-01-12,AM,321,90,8,7,14,10,3080.00,4290.00
2025-01-12,PM,207,61,5,4,14,7,1640.00,2980.25
2025-01-19,AM,315,88,8,6,15,10,3010.00,4200.00
2025-01-19,PM,203,59,5,4,15,7,1600.00,2910.50
2025-01-26,AM,329,94,9,7,15,11,3150.00,4380.75
2025-01-26,PM,211,63,5,5,15,8,1670.00,3050.00
2025-02-02,AM,317,89,8,6,14,10,3030.00,4230.25
2025-02-02,PM,204,58,5,4,14,7,1610.00,2940.00
2025-02-09,AM,322,92,8,7,14,11,3090.00,4310.50
2025-02-09,PM,208,60,5,4,14,7,1650.00,2990.75
2025-02-16,AM,310,87,8,6,14,10,2970.00,4160.00
2025-02-16,PM,200,56,5,4,14,7,1570.00,2850.25
2025-02-23,AM,327,93,9,7,15,11,3130.00,4360.00
2025-02-23,PM,212,64,6,5,15,8,1680.00,3080.50
2025-03-02,AM,319,88,8,6,14,10,3050.00,4220.75
2025-03-02,PM,206,59,5,4,14,7,1620.00,2950.00
2025-03-09,AM,324,91,8,7,15,11,3100.00,4290.25
2025-03-09,PM,210,62,5,5,15,7,1660.00,3020.00
2025-03-16,AM,335,96,9,7,15,12,3260.00,4510.50
2025-03-16,PM,218,65,6,5,15,8,1740.00,3160.75
2025-03-23,AM,311,87,8,6,14,10,3000.00,4180.00
2025-03-23,PM,202,58,5,4,14,7,1590.00,2900.25
2025-03-30,AM,298,83,7,5,13,9,2870.00,4020.00
2025-03-30,PM,194,53,4,4,13,6,1510.00,2760.50
2025-04-06,AM,389,112,10,9,16,14,4120.00,5840.75
2025-04-06,PM,274,84,7,6,16,11,2980.00,4210.00
2025-04-13,AM,326,92,8,7,15,11,3140.00,4380.25
2025-04-13,PM,213,63,6,5,15,8,1700.00,3110.00
2025-04-20,AM,318,89,8,6,14,10,3060.00,4250.50
2025-04-20,PM,207,61,5,4,14,7,1640.00,2980.75
2025-04-27,AM,322,91,8,7,14,11,3090.00,4300.00
2025-04-27,PM,209,62,5,5,14,7,1660.00,3010.25`

// ── Sign in ───────────────────────────────────────────────────────────────────

console.log('\n── Harbor Community Church — Wide Format Import ──────────────')
console.log(`\n[1/3] Signing in as ${EMAIL}...`)

const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body:    JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
const auth = await signIn.json()
if (!auth.access_token) {
  console.error('Auth failed:', JSON.stringify(auth))
  process.exit(1)
}
console.log('✓ Signed in')

// ── Submit import ─────────────────────────────────────────────────────────────

console.log('\n[2/3] Submitting CSV to import API...')

const importRes = await fetch(`${APP_URL}/api/onboarding/import`, {
  method:  'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': `sb-${SUPABASE_URL.match(/\/\/([^.]+)/)[1]}-auth-token=${JSON.stringify({
      access_token:  auth.access_token,
      refresh_token: auth.refresh_token,
      token_type:    'bearer',
      expires_in:    3600,
      expires_at:    Math.floor(Date.now() / 1000) + 3600,
      user:          auth.user,
    })}`,
  },
  body: JSON.stringify({
    sources: [
      { kind: 'csv', name: 'Harbor Weekly Services', value: HARBOR_CSV }
    ],
    freeText: `Harbor Community Church has two Sunday services called AM (9am) and PM (11am).
Kids ministry is branded KidZone — it runs during both services.
No youth ministry. Plate and eGiving are giving sources.
KidZone Helpers are the volunteers who serve in the kids ministry.`,
  }),
})

if (!importRes.ok) {
  const err = await importRes.text()
  console.error('Import API error:', importRes.status, err)
  process.exit(1)
}

const importData = await importRes.json()
const jobId = importData.job_id ?? importData.jobId
console.log(`✓ Stage A running — job: ${jobId}`)
if (!jobId) { console.error('No job_id in response:', JSON.stringify(importData)); process.exit(1) }

// ── Poll for result ───────────────────────────────────────────────────────────

console.log('\n[3/3] Waiting for Stage A to complete...')
let mapping = null
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 3000))
  const poll = await fetch(`${APP_URL}/api/onboarding/import?job_id=${jobId}`, {
    headers: {
      'Cookie': `sb-${SUPABASE_URL.match(/\/\/([^.]+)/)[1]}-auth-token=${JSON.stringify({
        access_token:  auth.access_token,
        refresh_token: auth.refresh_token,
        token_type:    'bearer',
        expires_in:    3600,
        expires_at:    Math.floor(Date.now() / 1000) + 3600,
        user:          auth.user,
      })}`,
    },
  })
  const data = await poll.json()
  if (data.job?.status === 'awaiting_confirmation') {
    mapping = data.job.proposed_mapping
    break
  }
  process.stdout.write('.')
}

if (!mapping) {
  console.error('\nTimed out waiting for Stage A')
  process.exit(1)
}

// ── Print results ─────────────────────────────────────────────────────────────

console.log('\n\n── Stage A Results ───────────────────────────────────────────\n')

const templates = mapping.proposed_setup?.service_templates ?? []
console.log(`Service templates (${templates.length}):`)
for (const t of templates) {
  console.log(`  [${t.service_code}] ${t.display_name}  tag=${t.primary_tag}`)
}

const volCats = mapping.proposed_setup?.volunteer_categories ?? []
console.log(`\nVolunteer categories (${volCats.length}):`)
for (const v of volCats) {
  console.log(`  ${v.name}  audience=${v.audience_type ?? v.audience_group_code ?? '?'}  tag=${v.primary_tag ?? '-'}`)
}

const sources = mapping.sources ?? []
console.log(`\nSources (${sources.length}):`)
for (const s of sources) {
  console.log(`  ${s.source_name}  date_col=${s.date_column}  default_template=${s.default_service_template_code ?? '-'}`)
  for (const c of s.column_map ?? []) {
    console.log(`    ${c.source_column.padEnd(22)} → ${c.dest_field}`)
  }
}

const givingSources = mapping.proposed_setup?.giving_sources ?? []
console.log(`\nGiving sources (${givingSources.length}):`)
for (const g of givingSources) {
  console.log(`  ${g.name}`)
}

const qs = mapping.clarification_questions ?? []
const blockingQs = qs.filter(q => q.blocking)
console.log(`\nQuestions: ${qs.length} (${blockingQs.length} blocking)`)
for (const q of qs) {
  console.log(`  [${q.blocking ? 'BLOCK' : 'opt  '}] ${q.title ?? q.question?.slice(0, 60)}`)
}

console.log(`\nConfidence: ${mapping.confidence}  weeks_observed: ${mapping.weeks_observed}`)
console.log(`\n── Review URL ────────────────────────────────────────────────`)
console.log(`http://localhost:3000/onboarding/import/confirm?job_id=${jobId}\n`)
