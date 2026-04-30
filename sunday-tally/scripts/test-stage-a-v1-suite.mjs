/**
 * test-stage-a-v1-suite.mjs
 *
 * 12 synthetic shapes covering diverse church patterns.
 * Captures V1 Stage A's behavior across them so V2 has a comparison baseline.
 *
 * Shapes target patterns the first 5-shape test didn't exercise:
 *   - multi-campus, multi-language
 *   - dedicated kids ministry as separate template (likely to hit period_response bug)
 *   - heavy volunteer/stat columns
 *   - online attendance (audience or service?)
 *   - mixed weekly + per-service giving in one workbook
 *   - sparse data with gaps (vacation/holiday weeks)
 *   - many templates (5+ services)
 *   - service times in freeText description
 *   - non-standard date format
 *   - quarterly cadence
 *   - custom tag set (no MORNING/EVENING — only church-internal names)
 *
 * Output: writes results to STAGE_A_V1_TEST_RESULTS.json at the project root.
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY      = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP_URL       = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const DEMO_EMAIL    = 'demo@sundaytally.dev'
const DEMO_PASSWORD = 'SundayTally123!'

// ── Sign in ──────────────────────────────────────────────────────────────────
const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
}).then(r => r.json())
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1]
const cookieHeader = `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: signIn.access_token, refresh_token: signIn.refresh_token,
  expires_at: signIn.expires_at, expires_in: signIn.expires_in,
  token_type: signIn.token_type, user: signIn.user,
}))}`

// ── Helpers ──────────────────────────────────────────────────────────────────
function* sundays(start, count) {
  // start should be a Sunday in ISO date form. We construct a noon-local Date
  // to dodge timezone DST drift around midnight.
  const [y, m, d] = start.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  while (dt.getDay() !== 0) dt.setDate(dt.getDate() + 1)
  for (let i = 0; i < count; i++) {
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    yield `${yy}-${mm}-${dd}`
    dt.setDate(dt.getDate() + 7)
  }
}
function* wednesdays(start, count) {
  const [y, m, d] = start.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  while (dt.getDay() !== 3) dt.setDate(dt.getDate() + 1)
  for (let i = 0; i < count; i++) {
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    yield `${yy}-${mm}-${dd}`
    dt.setDate(dt.getDate() + 7)
  }
}
const seed = (i, base, jitter) => Math.round(base + Math.sin(i * 1.3) * jitter)

// ── 12 test shapes ───────────────────────────────────────────────────────────

// 1. Multi-campus — same service name at two locations
function shapeMultiCampus() {
  let csv = 'Date,Campus,Adults,Kids,Youth,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 24)) {
    csv += `${d},Main,${seed(i, 250, 30)},${seed(i, 60, 10)},${seed(i, 35, 5)},${seed(i, 5500, 600)}\n`
    csv += `${d},South,${seed(i, 90, 15)},${seed(i, 25, 5)},${seed(i, 12, 3)},${seed(i, 1800, 200)}\n`
    i++
  }
  return { name: 'multi-campus', value: csv, kind: 'csv', freeText: 'Two campuses — Main and South. Same Sunday service at both.' }
}

// 2. Multi-language — English + Spanish service
function shapeMultiLanguage() {
  let csv = 'Date,Service Language,Adults,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 20)) {
    csv += `${d},English,${seed(i, 180, 25)},${seed(i, 50, 8)},${seed(i, 4000, 500)}\n`
    csv += `${d},Spanish,${seed(i, 70, 12)},${seed(i, 25, 5)},${seed(i, 1500, 200)}\n`
    i++
  }
  return { name: 'multi-language', value: csv, kind: 'csv', freeText: '' }
}

// 3. Dedicated KIDS ministry as its own template (should test period_response.<>.KIDS path)
function shapeKidsAsTemplate() {
  let csv = 'Date,Service,Attendance,Kids Rooms Open This Week,Volunteers\n'
  let i = 0
  for (const d of sundays('2024-04-07', 24)) {
    csv += `${d},Adult Service,${seed(i, 150, 25)},,${seed(i, 12, 3)}\n`
    csv += `${d},LifeKids,${seed(i, 60, 10)},${seed(i, 8, 2)},${seed(i, 18, 4)}\n`
    i++
  }
  return { name: 'kids-as-template', value: csv, kind: 'csv', freeText: 'LifeKids is our kids ministry — runs at the same time as the adult service. Rooms Open is a weekly facilities count.' }
}

// 4. Volunteer-heavy
function shapeVolunteerHeavy() {
  let csv = 'Date,Adults,Greeters,Parking,Hosts,Production,Worship,Ushers,Coffee,Security\n'
  let i = 0
  for (const d of sundays('2024-04-07', 20)) {
    csv += `${d},${seed(i, 200, 25)},${seed(i, 8, 2)},${seed(i, 6, 1)},${seed(i, 10, 2)},${seed(i, 12, 2)},${seed(i, 8, 2)},${seed(i, 6, 1)},${seed(i, 4, 1)},${seed(i, 3, 1)}\n`
    i++
  }
  return { name: 'volunteer-heavy', value: csv, kind: 'csv', freeText: '' }
}

// 5. Stat-heavy (lots of response/decision categories)
function shapeStatHeavy() {
  let csv = 'Date,Adults,First Time Guests,Salvations,Rededications,Baptisms,Prayer Cards,Communion Count\n'
  let i = 0
  for (const d of sundays('2024-04-07', 20)) {
    csv += `${d},${seed(i, 160, 20)},${seed(i, 4, 2)},${seed(i, 2, 1)},${seed(i, 1, 1)},${seed(i, 1, 1)},${seed(i, 12, 4)},${seed(i, 140, 15)}\n`
    i++
  }
  return { name: 'stat-heavy', value: csv, kind: 'csv', freeText: '' }
}

// 6. Online attendance — audience or service?
function shapeOnlineAttendance() {
  let csv = 'Date,In Person,Online,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 20)) {
    csv += `${d},${seed(i, 120, 20)},${seed(i, 80, 15)},${seed(i, 30, 6)},${seed(i, 3000, 400)}\n`
    i++
  }
  return { name: 'online-attendance', value: csv, kind: 'csv', freeText: '' }
}

// 7. Mixed weekly + per-service giving
function shapeMixedGiving() {
  // Two sources in one workbook. First sheet is per-service. Second is weekly total.
  let s1 = 'Date,Service,Attendance,Plate\n'
  let s2 = 'Week Of,Total Online Giving,Total App Giving\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    s1 += `${d},9am,${seed(i, 100, 15)},${seed(i, 1500, 200)}\n`
    s1 += `${d},11am,${seed(i, 130, 20)},${seed(i, 2000, 250)}\n`
    s2 += `${d},${seed(i, 4500, 600)},${seed(i, 1200, 200)}\n`
    i++
  }
  return [
    { name: 'service-giving', value: s1, kind: 'csv' },
    { name: 'weekly-online-giving', value: s2, kind: 'csv' },
  ]
}

// 8. Sparse data with gaps (vacation weeks)
function shapeSparse() {
  let csv = 'Date,Adults,Kids,Offering\n'
  let i = 0
  let skip = 0
  for (const d of sundays('2024-04-07', 30)) {
    skip++
    if (skip === 5 || skip === 6 || skip === 14) continue // 3 missing Sundays
    csv += `${d},${seed(i, 150, 25)},${seed(i, 40, 8)},${seed(i, 2500, 400)}\n`
    i++
  }
  return { name: 'sparse-with-gaps', value: csv, kind: 'csv', freeText: 'We took a few weeks off for vacation in 2024.' }
}

// 9. Many templates — 5 services in a single day
function shapeManyTemplates() {
  let csv = 'Date,Service,Attendance,Offering\n'
  let i = 0
  const services = ['Saturday Night', '8am', '9:30am', '11am', '12:30pm']
  for (const d of sundays('2024-04-07', 16)) {
    for (const s of services) {
      csv += `${d},${s},${seed(i, 150, 25)},${seed(i, 2200, 300)}\n`
      i++
    }
  }
  return { name: 'many-templates', value: csv, kind: 'csv', freeText: 'We run 5 services every weekend across the campus.' }
}

// 10. Service times in freeText description
function shapeTimesInDescription() {
  let csv = 'Date,Service,Adults,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    csv += `${d},Sunday AM,${seed(i, 180, 25)},${seed(i, 3500, 400)}\n`
    csv += `${d},Sunday PM,${seed(i, 60, 10)},${seed(i, 800, 100)}\n`
    i++
  }
  return { name: 'times-in-description', value: csv, kind: 'csv',
    freeText: 'Sunday AM service is at 10:30. Sunday PM is at 6pm. Both meet at our Main Campus.' }
}

// 11. Non-standard date format (DD/MM/YYYY European)
function shapeEuropeanDates() {
  let csv = 'Date,Adults,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    const [y, m, day] = d.split('-')
    csv += `${day}/${m}/${y},${seed(i, 140, 20)},${seed(i, 35, 7)},${seed(i, 2200, 300)}\n`
    i++
  }
  return { name: 'european-dates', value: csv, kind: 'csv', freeText: '' }
}

// 12. Custom tag terminology — church uses internal names not in the standard taxonomy
function shapeCustomTerminology() {
  let csv = 'Date,Gathering,Adults,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    csv += `${d},Foundation Service,${seed(i, 200, 25)},${seed(i, 50, 8)},${seed(i, 4000, 500)}\n`
    csv += `${d},Cornerstone Gathering,${seed(i, 90, 15)},${seed(i, 25, 5)},${seed(i, 1500, 200)}\n`
    i++
  }
  return { name: 'custom-terminology', value: csv, kind: 'csv', freeText: '' }
}

const tests = [
  { sources: [shapeMultiCampus()],         label: 'multi-campus' },
  { sources: [shapeMultiLanguage()],       label: 'multi-language' },
  { sources: [shapeKidsAsTemplate()],      label: 'kids-as-template' },
  { sources: [shapeVolunteerHeavy()],      label: 'volunteer-heavy' },
  { sources: [shapeStatHeavy()],           label: 'stat-heavy' },
  { sources: [shapeOnlineAttendance()],    label: 'online-attendance' },
  { sources: shapeMixedGiving(),           label: 'mixed-giving' },
  { sources: [shapeSparse()],              label: 'sparse-with-gaps' },
  { sources: [shapeManyTemplates()],       label: 'many-templates' },
  { sources: [shapeTimesInDescription()],  label: 'times-in-description' },
  { sources: [shapeEuropeanDates()],       label: 'european-dates' },
  { sources: [shapeCustomTerminology()],   label: 'custom-terminology' },
]

// ── Runner ───────────────────────────────────────────────────────────────────
console.log(`\n══ V1 Stage A Test Suite — ${tests.length} shapes ══\n`)
const results = []
for (const t of tests) {
  console.log(`\n── ${t.label} ──`)
  const freeText = t.sources[0].freeText ?? ''
  if (freeText) console.log(`  freeText: "${freeText}"`)
  console.log(`  sources: ${t.sources.length}`)
  const t0 = Date.now()
  const res = await fetch(`${APP_URL}/api/onboarding/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
    body: JSON.stringify({ sources: t.sources.map(s => ({ kind: s.kind, name: s.name, value: s.value })), freeText }),
  })
  const elapsed = Math.round((Date.now() - t0) / 1000)
  const body = await res.json()
  if (!res.ok) {
    console.log(`  ✗ FAILED (${res.status}, ${elapsed}s):`, body.error, body.detail ?? '')
    results.push({ label: t.label, ok: false, elapsed_s: elapsed, error: body.error, detail: body.detail })
    continue
  }
  const m = body.proposed_mapping
  const summary = {
    label: t.label,
    ok: true,
    elapsed_s: elapsed,
    confidence: m?.confidence,
    weeks_observed: m?.weeks_observed,
    sources_count: m?.sources?.length ?? 0,
    templates: (m?.proposed_setup?.service_templates ?? []).map(s => ({
      name: s.display_name, code: s.service_code, tag: s.primary_tag,
      day_of_week: s.day_of_week, start_time: s.start_time, audience_type: s.audience_type,
    })),
    locations: (m?.proposed_setup?.locations ?? []).map(l => l.name),
    response_categories: (m?.proposed_setup?.response_categories ?? []).map(r => `${r.name} (${r.stat_scope})`),
    giving_sources: (m?.proposed_setup?.giving_sources ?? []).map(g => g.name),
    volunteer_categories: (m?.proposed_setup?.volunteer_categories ?? []).map(v => `${v.name} (${v.audience_type ?? '—'})`),
    questions: (m?.clarification_questions ?? []).map(q => ({ id: q.id, blocking: q.blocking, title: q.title })),
    dest_fields: (() => {
      const set = new Set()
      for (const src of m?.sources ?? []) {
        for (const c of src.column_map ?? []) set.add(c.dest_field)
        if (src.tall_format?.area_field_map) for (const v of Object.values(src.tall_format.area_field_map)) set.add(v)
      }
      return [...set].sort()
    })(),
  }
  results.push(summary)
  const tmpl = summary.templates.map(t => `${t.name}|${t.tag}|dow=${t.day_of_week}`).join(' · ')
  console.log(`  ✓ ${elapsed}s · ${summary.weeks_observed}wk · ${summary.confidence} · ${summary.templates.length}tmpls · ${summary.questions.length}qs`)
  console.log(`    templates: ${tmpl || '(none)'}`)
  console.log(`    questions: ${summary.questions.map(q => q.id).join(', ') || '(none)'}`)
}

// ── Save full results ────────────────────────────────────────────────────────
const out = resolve(__dirname, '../../STAGE_A_V1_TEST_RESULTS.json')
writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2))
console.log(`\n✓ Full results saved to: ${out}`)
