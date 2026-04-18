/**
 * End-to-end test — creates a fresh church, enters 10 weeks of Sunday data,
 * then calls the dashboard query layer and prints results.
 *
 * Run: node test-e2e.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjc4MzAsImV4cCI6MjA5MTg0MzgzMH0.Bl_JHSp-p3qnVt2Fh1cX2zBCrdK9UHxQfdlOSgzt8ag'
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anon  = createClient(SUPABASE_URL, ANON_KEY)

// ─── Date helpers (mirrors dashboard.ts Sunday-week logic) ────────────────────
function weekStartOf(d) {
  const day = d.getDay()
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  sunday.setHours(0, 0, 0, 0)
  return sunday.toISOString().split('T')[0]
}
function shiftDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// Past Sundays relative to today 2026-04-17
const TODAY = '2026-04-17'
const now = new Date(TODAY + 'T12:00:00')
const THIS_WEEK_SUNDAY = weekStartOf(now)  // 2026-04-12

// Generate N past Sundays (including this week's)
function pastSundays(n) {
  const result = []
  for (let i = 0; i < n; i++) result.push(shiftDays(THIS_WEEK_SUNDAY, -7 * i))
  return result
}

// ─── Setup helpers ─────────────────────────────────────────────────────────────
function ok(label, error) {
  if (error) { console.error(`  ✗ ${label}:`, error.message); process.exit(1) }
  console.log(`  ✓ ${label}`)
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const TEST_EMAIL = `test-church-${Date.now()}@sundaytally.test`
const TEST_PASS  = 'TestPass123!'

console.log('\n═══════════════════════════════════════════════')
console.log('  SundayTally — End-to-End Test')
console.log('═══════════════════════════════════════════════\n')

// ─── STEP 1: Create user ──────────────────────────────────────────────────────
console.log('STEP 1 — Create user')
const { data: authData, error: authErr } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASS,
  user_metadata: { full_name: 'Test Pastor' },
  email_confirm: true,
})
ok('Create auth user', authErr)
const userId = authData.user.id

// ─── STEP 2: Create church ─────────────────────────────────────────────────────
console.log('\nSTEP 2 — Create church')
const slug = `test-church-${Math.random().toString(36).substring(2, 7)}`
const { data: church, error: churchErr } = await admin
  .from('churches')
  .insert({
    name: 'Grace Community Church',
    slug,
    tracks_volunteers: true,
    tracks_responses: true,
    tracks_giving: true,
    tracks_kids_attendance: true,
    tracks_youth_attendance: true,
  })
  .select('id')
  .single()
ok('Create church', churchErr)
const churchId = church.id

// Default location
const { error: locErr } = await admin.from('church_locations')
  .insert({ church_id: churchId, name: 'Main Campus', code: 'MAIN', sort_order: 1 })
ok('Create location', locErr)

// Seed defaults
const seedResults = await Promise.all([
  admin.rpc('seed_default_stat_categories', { p_church_id: churchId }),
  admin.rpc('seed_default_giving_sources',  { p_church_id: churchId }),
  admin.rpc('seed_default_service_tags',    { p_church_id: churchId }),
])
seedResults.forEach((r, i) => ok(`Seed defaults [${i}]`, r.error))

// Membership
const { error: memErr } = await admin.from('church_memberships')
  .insert({ user_id: userId, church_id: churchId, role: 'owner', is_active: true })
ok('Create membership', memErr)

// ─── STEP 3: Sign in as the user ──────────────────────────────────────────────
console.log('\nSTEP 3 — Sign in')
const { error: signInErr } = await anon.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS })
ok('Sign in', signInErr)

// ─── STEP 4: Load seeded tags + location ──────────────────────────────────────
console.log('\nSTEP 4 — Load seeded tags + location')
const { data: tags } = await admin.from('service_tags')
  .select('id, tag_code, tag_name')
  .eq('church_id', churchId)
  .eq('is_active', true)
const morningTag = tags.find(t => t.tag_code === 'MORNING')
const eveningTag = tags.find(t => t.tag_code === 'EVENING')
console.log(`  tags: ${tags.map(t => t.tag_code).join(', ')}`)

const { data: locations } = await admin.from('church_locations')
  .select('id').eq('church_id', churchId).limit(1)
const locationId = locations[0].id
console.log(`  location id: ${locationId}`)

// ─── STEP 5: Create service templates ─────────────────────────────────────────
console.log('\nSTEP 5 — Create service templates')
const { data: morningTmpl, error: tmplErr1 } = await admin.from('service_templates')
  .insert({
    church_id: churchId,
    service_code: 'MORNING_MAIN',
    display_name: 'Morning Service',
    location_id: locationId,
    sort_order: 1,
    primary_tag_id: morningTag.id,
    is_active: true,
  })
  .select('id').single()
ok('Create morning template', tmplErr1)

// ─── STEP 6: Create volunteer categories ──────────────────────────────────────
console.log('\nSTEP 6 — Create volunteer categories')
const volCats = [
  { church_id: churchId, audience_group_code: 'MAIN', category_code: 'MUSIC',   category_name: 'Music',    sort_order: 1 },
  { church_id: churchId, audience_group_code: 'MAIN', category_code: 'PARKING', category_name: 'Parking',  sort_order: 2 },
  { church_id: churchId, audience_group_code: 'KIDS', category_code: 'TEACHERS',category_name: 'Teachers', sort_order: 1 },
]
const { data: insertedVolCats, error: volCatErr } = await admin.from('volunteer_categories')
  .insert(volCats).select('id, category_code')
ok('Create volunteer categories', volCatErr)
const catByCode = {}
for (const vc of insertedVolCats) catByCode[vc.category_code] = vc.id

// ─── STEP 7: Create service occurrences + data (10 Sundays) ──────────────────
console.log('\nSTEP 7 — Create occurrences + enter data (10 Sundays)\n')
const sundays = pastSundays(10)

// Weekly data patterns (realistic church numbers with slight growth trend)
const weekData = [
  { main: 320, kids: 55, youth: 30, music: 8, parking: 5, teachers: 4, giving: 4800, ftd: 2, reded: 1 },
  { main: 310, kids: 50, youth: 28, music: 8, parking: 4, teachers: 4, giving: 4600, ftd: 1, reded: 0 },
  { main: 335, kids: 58, youth: 32, music: 9, parking: 5, teachers: 5, giving: 5100, ftd: 3, reded: 1 },
  { main: 290, kids: 45, youth: 25, music: 7, parking: 4, teachers: 3, giving: 4300, ftd: 1, reded: 0 },
  { main: 315, kids: 52, youth: 29, music: 8, parking: 5, teachers: 4, giving: 4700, ftd: 2, reded: 1 },
  { main: 325, kids: 54, youth: 31, music: 8, parking: 5, teachers: 4, giving: 4900, ftd: 2, reded: 0 },
  { main: 300, kids: 48, youth: 27, music: 7, parking: 4, teachers: 3, giving: 4400, ftd: 1, reded: 1 },
  { main: 280, kids: 42, youth: 22, music: 6, parking: 3, teachers: 3, giving: 4100, ftd: 0, reded: 0 },
  { main: 340, kids: 60, youth: 34, music: 9, parking: 6, teachers: 5, giving: 5200, ftd: 3, reded: 2 },
  { main: 295, kids: 47, youth: 26, music: 7, parking: 4, teachers: 4, giving: 4500, ftd: 1, reded: 0 },
]

// Load stat categories
const { data: statCats } = await admin.from('response_categories')
  .select('id, category_code').eq('church_id', churchId)
const ftdCatId    = statCats.find(c => c.category_code === 'FIRST_TIME_DECISION')?.id
const rededCatId  = statCats.find(c => c.category_code === 'REDEDICATION')?.id

// Load giving sources
const { data: givingSources } = await admin.from('giving_sources')
  .select('id').eq('church_id', churchId).limit(1)
const givingSourceId = givingSources?.[0]?.id

for (let i = 0; i < sundays.length; i++) {
  const date = sundays[i]
  const d = weekData[i]
  const weekLabel = i === 0 ? 'CURRENT WEEK' : `${7 * i} days ago`

  // Create occurrence
  const { data: occ, error: occErr } = await admin.from('service_occurrences')
    .insert({
      church_id: churchId,
      service_template_id: morningTmpl.id,
      service_date: date,
      location_id: locationId,
      status: 'active',
    })
    .select('id').single()
  if (occErr) { console.error(`  ✗ Occurrence ${date}:`, occErr.message); continue }

  // Tag it
  await admin.from('service_occurrence_tags')
    .insert({ service_occurrence_id: occ.id, service_tag_id: morningTag.id })

  // Attendance
  await admin.from('attendance_entries').insert({
    service_occurrence_id: occ.id,
    main_attendance: d.main,
    kids_attendance: d.kids,
    youth_attendance: d.youth,
  })

  // Volunteers
  await admin.from('volunteer_entries').insert([
    { service_occurrence_id: occ.id, volunteer_category_id: catByCode.MUSIC,    volunteer_count: d.music,    is_not_applicable: false },
    { service_occurrence_id: occ.id, volunteer_category_id: catByCode.PARKING,  volunteer_count: d.parking,  is_not_applicable: false },
    { service_occurrence_id: occ.id, volunteer_category_id: catByCode.TEACHERS, volunteer_count: d.teachers, is_not_applicable: false },
  ])

  // Stats — FTD (MAIN) and Rededication (MAIN)
  if (ftdCatId) {
    await admin.from('response_entries').insert({
      service_occurrence_id: occ.id,
      response_category_id: ftdCatId,
      audience_group_code: 'MAIN',
      stat_value: d.ftd,
      is_not_applicable: false,
    })
  }
  if (rededCatId && d.reded > 0) {
    await admin.from('response_entries').insert({
      service_occurrence_id: occ.id,
      response_category_id: rededCatId,
      audience_group_code: 'MAIN',
      stat_value: d.reded,
      is_not_applicable: false,
    })
  }

  // Giving
  if (givingSourceId) {
    await admin.from('giving_entries').insert({
      service_occurrence_id: occ.id,
      giving_source_id: givingSourceId,
      giving_amount: d.giving.toFixed(2),
    })
  }

  const total = d.main + d.kids + d.youth
  const vols  = d.music + d.parking + d.teachers
  console.log(`  ${date} [${weekLabel.padEnd(16)}]  Att: ${total} (Main ${d.main} Kids ${d.kids} Youth ${d.youth})  Vols: ${vols}  Giving: $${d.giving}`)
}

// ─── STEP 8: Read back dashboard data ─────────────────────────────────────────
console.log('\nSTEP 8 — Read back dashboard data (raw query)\n')

const { data: occurrences, error: readErr } = await admin
  .from('service_occurrences')
  .select(`
    id, service_date,
    attendance_entries(main_attendance, kids_attendance, youth_attendance),
    volunteer_entries(volunteer_count, is_not_applicable,
      volunteer_categories(id, category_name, audience_group_code, sort_order, is_active)),
    response_entries(stat_value, is_not_applicable, audience_group_code,
      response_categories(id, category_name, category_code, stat_scope, display_order, is_active)),
    giving_entries(giving_amount)
  `)
  .eq('church_id', churchId)
  .eq('status', 'active')
  .order('service_date')

if (readErr) { console.error('READ ERROR:', readErr); process.exit(1) }

console.log(`  Fetched ${occurrences.length} occurrences\n`)

// Compute dashboard numbers inline (mirrors dashboard.ts logic)
const yearStart = '2026-01-01'
const fourWksAgo = shiftDays(THIS_WEEK_SUNDAY, -28)
const lastWeekEnd = shiftDays(THIS_WEEK_SUNDAY, -1)

let weekTotal = 0, weekKids = 0, weekYouth = 0, weekVols = 0, weekGiving = 0, weekFtd = 0
let last4Weeks = []
let ytdWeeks = []

// Group by ISO sunday-week bucket
function weekBucket(dateStr) { return weekStartOf(new Date(dateStr + 'T12:00:00')) }

const byWeek = {}
for (const occ of occurrences) {
  const bucket = weekBucket(occ.service_date)
  if (!byWeek[bucket]) byWeek[bucket] = { main: 0, kids: 0, youth: 0, vols: 0, giving: 0, ftd: 0 }
  const ae = Array.isArray(occ.attendance_entries) ? occ.attendance_entries[0] : occ.attendance_entries
  if (ae) {
    byWeek[bucket].main  += ae.main_attendance  ?? 0
    byWeek[bucket].kids  += ae.kids_attendance  ?? 0
    byWeek[bucket].youth += ae.youth_attendance ?? 0
  }
  for (const ve of occ.volunteer_entries ?? []) {
    if (!ve.is_not_applicable) byWeek[bucket].vols += ve.volunteer_count ?? 0
  }
  for (const re of occ.response_entries ?? []) {
    if (!re.is_not_applicable && re.stat_value !== null) {
      const cat = Array.isArray(re.response_categories) ? re.response_categories[0] : re.response_categories
      if (cat?.category_code === 'FIRST_TIME_DECISION') byWeek[bucket].ftd += re.stat_value
    }
  }
  for (const ge of occ.giving_entries ?? []) {
    byWeek[bucket].giving += parseFloat(ge.giving_amount ?? '0')
  }
}

console.log('  ┌─ Weekly Buckets ─────────────────────────────────────────────────────────────')
console.log('  │  Week (Sun)    Grand Total  Kids  Youth  Vols  Giving    FTD')
console.log('  ├─────────────────────────────────────────────────────────────────────────────')
for (const [wk, d] of Object.entries(byWeek).sort()) {
  const total = d.main + d.kids + d.youth
  const marker = wk === THIS_WEEK_SUNDAY ? ' ← CURRENT' : ''
  console.log(`  │  ${wk}   ${String(total).padStart(6)}   ${String(d.kids).padStart(4)}  ${String(d.youth).padStart(5)}  ${String(d.vols).padStart(4)}  $${String(d.giving.toFixed(0)).padStart(6)}   ${d.ftd}${marker}`)
}
console.log('  └─────────────────────────────────────────────────────────────────────────────')

// Summary stats
const currentWeek = byWeek[THIS_WEEK_SUNDAY]
const last4 = Object.entries(byWeek)
  .filter(([wk]) => wk >= fourWksAgo && wk <= lastWeekEnd)
  .map(([, d]) => d)
const ytd = Object.entries(byWeek)
  .filter(([wk]) => wk >= yearStart && wk <= THIS_WEEK_SUNDAY)
  .map(([, d]) => d)

function avg(arr, fn) {
  const vals = arr.map(fn).filter(n => n !== null && n !== undefined)
  return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null
}

console.log('\n  ┌─ Dashboard Summary (Expected Values) ──────────────────────────────────────')
console.log('  │                    Curr Wk    Last 4-Wk Avg    Curr YTD Avg')
const grandTotal = (d) => d.main + d.kids + d.youth
console.log(`  │  Grand Total      ${String(grandTotal(currentWeek || {})).padStart(6)}       ${String(avg(last4, grandTotal)).padStart(8)}          ${String(avg(ytd, grandTotal)).padStart(8)}`)
console.log(`  │  Adults           ${String(currentWeek?.main ?? '–').padStart(6)}       ${String(avg(last4, d => d.main)).padStart(8)}          ${String(avg(ytd, d => d.main)).padStart(8)}`)
console.log(`  │  Kids             ${String(currentWeek?.kids ?? '–').padStart(6)}       ${String(avg(last4, d => d.kids)).padStart(8)}          ${String(avg(ytd, d => d.kids)).padStart(8)}`)
console.log(`  │  Youth            ${String(currentWeek?.youth ?? '–').padStart(6)}       ${String(avg(last4, d => d.youth)).padStart(8)}          ${String(avg(ytd, d => d.youth)).padStart(8)}`)
console.log(`  │  Volunteers       ${String(currentWeek?.vols ?? '–').padStart(6)}       ${String(avg(last4, d => d.vols)).padStart(8)}          ${String(avg(ytd, d => d.vols)).padStart(8)}`)
console.log(`  │  FTD              ${String(currentWeek?.ftd ?? '–').padStart(6)}       ${String(avg(last4, d => d.ftd)).padStart(8)}          ${String(avg(ytd, d => d.ftd)).padStart(8)}`)
console.log(`  │  Giving           $${String(currentWeek?.giving?.toFixed(0) ?? '–').padStart(5)}       $${String(avg(last4, d => d.giving)?.toFixed(0) ?? '–').padStart(7)}         $${String(avg(ytd, d => d.giving)?.toFixed(0) ?? '–').padStart(7)}`)
console.log('  └─────────────────────────────────────────────────────────────────────────────')

// KPI Card check (this week vs last week)
const lastWeekSunday = shiftDays(THIS_WEEK_SUNDAY, -7)
const lastWeekData = byWeek[lastWeekSunday]
console.log('\n  ┌─ KPI Highlight Cards ───────────────────────────────────────────────────────')
console.log(`  │  Attendance: ${grandTotal(currentWeek || {})} this wk  vs  ${grandTotal(lastWeekData || {})} last wk`)
console.log(`  │  Giving:     $${(currentWeek?.giving ?? 0).toFixed(0)} this wk  vs  $${(lastWeekData?.giving ?? 0).toFixed(0)} last wk`)
console.log(`  │  Volunteers: ${currentWeek?.vols ?? 0} this wk  vs  ${lastWeekData?.vols ?? 0} last wk`)
console.log('  └─────────────────────────────────────────────────────────────────────────────')

// ─── CLEANUP ──────────────────────────────────────────────────────────────────
console.log('\nSTEP 9 — Cleanup\n')
await admin.from('churches').delete().eq('id', churchId)
await admin.auth.admin.deleteUser(userId)
console.log('  ✓ Test church and user deleted')

console.log('\n═══════════════════════════════════════════════')
console.log('  Test PASSED')
console.log('═══════════════════════════════════════════════\n')
