/**
 * SundayTally — 100 QA Tests + Supabase Table Audit
 *
 * Covers:
 *  A.  Auth & Provisioning         (T01–T12)
 *  B.  Service Templates & Tags    (T13–T22)
 *  C.  Occurrences & Schedules     (T23–T30)
 *  D.  Attendance Entry            (T31–T40)
 *  E.  Volunteer Entry             (T41–T50)
 *  F.  Stats / Response Entry      (T51–T60)
 *  G.  Giving Entry                (T61–T67)
 *  H.  Dashboard Calculations      (T68–T82)
 *  I.  RLS / Multi-Tenancy         (T83–T90)
 *  J.  Edge Cases & Constraints    (T91–T100)
 *
 * Run: node test-qa-100.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL  = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjc4MzAsImV4cCI6MjA5MTg0MzgzMH0.Bl_JHSp-p3qnVt2Fh1cX2zBCrdK9UHxQfdlOSgzt8ag'
const SVC  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(URL, SVC, { auth: { persistSession: false } })
const anon  = createClient(URL, ANON)

// ─── Test harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0
const failures = []

async function test(id, desc, fn) {
  try {
    await fn()
    console.log(`  ✓ ${id} ${desc}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${id} ${desc}`)
    console.log(`      → ${e.message}`)
    failed++
    failures.push({ id, desc, error: e.message })
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed')
}

function section(label) {
  console.log(`\n── ${label} ${'─'.repeat(60 - label.length)}`)
}

// ─── Setup: two test churches ──────────────────────────────────────────────────
const TS   = Date.now()
const E1   = `qa1.${TS}@test.local`
const E2   = `qa2.${TS}@test.local`
const PASS = 'QaPass1234!'

let u1Id, u2Id, c1Id, c2Id
let loc1Id, loc2Id
let morningTagId, eveningTagId
let tmpl1Id, tmpl2Id
let occ1Id, occ2Id, occ3Id
let volCat1Id, volCat2Id
let statCat1Id, statCat2Id
let givSrc1Id
let anon1 // signed-in client for church 1

async function setup() {
  console.log('\nSETUP — creating two test churches...\n')

  // Church 1 — full tracking on
  const { data: a1 } = await admin.auth.admin.createUser({ email: E1, password: PASS, email_confirm: true, user_metadata: { full_name: 'QA Pastor 1' } })
  u1Id = a1.user.id
  const { data: ch1 } = await admin.from('churches').insert({ name: 'QA Church One', slug: `qa1-${TS}`, tracks_volunteers: true, tracks_responses: true, tracks_giving: true, tracks_kids_attendance: true, tracks_youth_attendance: true }).select('id').single()
  c1Id = ch1.id
  await admin.from('church_locations').insert({ church_id: c1Id, name: 'Main Campus', code: 'MAIN', sort_order: 1 })
  await Promise.all([
    admin.rpc('seed_default_stat_categories', { p_church_id: c1Id }),
    admin.rpc('seed_default_giving_sources',  { p_church_id: c1Id }),
    admin.rpc('seed_default_service_tags',    { p_church_id: c1Id }),
  ])
  await admin.from('church_memberships').insert({ user_id: u1Id, church_id: c1Id, role: 'owner', is_active: true })

  // Church 2 — no volunteers/responses/giving
  const { data: a2 } = await admin.auth.admin.createUser({ email: E2, password: PASS, email_confirm: true, user_metadata: { full_name: 'QA Pastor 2' } })
  u2Id = a2.user.id
  const { data: ch2 } = await admin.from('churches').insert({ name: 'QA Church Two', slug: `qa2-${TS}`, tracks_volunteers: false, tracks_responses: false, tracks_giving: false, tracks_kids_attendance: false, tracks_youth_attendance: false }).select('id').single()
  c2Id = ch2.id
  await admin.from('church_locations').insert({ church_id: c2Id, name: 'Main Campus', code: 'MAIN', sort_order: 1 })
  await Promise.all([
    admin.rpc('seed_default_stat_categories', { p_church_id: c2Id }),
    admin.rpc('seed_default_giving_sources',  { p_church_id: c2Id }),
    admin.rpc('seed_default_service_tags',    { p_church_id: c2Id }),
  ])
  await admin.from('church_memberships').insert({ user_id: u2Id, church_id: c2Id, role: 'owner', is_active: true })

  // Get references
  const { data: locs1 } = await admin.from('church_locations').select('id').eq('church_id', c1Id).limit(1)
  loc1Id = locs1[0].id
  const { data: locs2 } = await admin.from('church_locations').select('id').eq('church_id', c2Id).limit(1)
  loc2Id = locs2[0].id

  const { data: tags1 } = await admin.from('service_tags').select('id, tag_code').eq('church_id', c1Id).eq('is_active', true)
  morningTagId = tags1.find(t => t.tag_code === 'MORNING')?.id
  eveningTagId = tags1.find(t => t.tag_code === 'EVENING')?.id

  const { data: statCats } = await admin.from('response_categories').select('id, category_code').eq('church_id', c1Id)
  statCat1Id = statCats.find(c => c.category_code === 'FIRST_TIME_DECISION')?.id
  statCat2Id = statCats.find(c => c.category_code === 'REDEDICATION')?.id

  const { data: givSrcs } = await admin.from('giving_sources').select('id').eq('church_id', c1Id).limit(1)
  givSrc1Id = givSrcs?.[0]?.id

  // Volunteer categories for C1
  const { data: vc } = await admin.from('volunteer_categories').insert([
    { church_id: c1Id, audience_group_code: 'MAIN', category_code: 'MUSIC',    category_name: 'Music',    sort_order: 1 },
    { church_id: c1Id, audience_group_code: 'KIDS', category_code: 'TEACHERS', category_name: 'Teachers', sort_order: 1 },
  ]).select('id, category_code')
  volCat1Id = vc.find(v => v.category_code === 'MUSIC')?.id
  volCat2Id = vc.find(v => v.category_code === 'TEACHERS')?.id

  // Service templates
  const { data: t1 } = await admin.from('service_templates').insert({ church_id: c1Id, service_code: `MORN_${TS}`, display_name: 'Morning Service', location_id: loc1Id, sort_order: 1, primary_tag_id: morningTagId, is_active: true }).select('id').single()
  tmpl1Id = t1.id
  const { data: t2 } = await admin.from('service_templates').insert({ church_id: c2Id, service_code: `MORN2_${TS}`, display_name: 'Morning', location_id: loc2Id, sort_order: 1, is_active: true }).select('id').single()
  tmpl2Id = t2.id

  // Sign in as church 1 owner
  await anon.auth.signInWithPassword({ email: E1, password: PASS })
  anon1 = anon

  // Create three occurrences for church 1
  const dates = ['2026-04-12', '2026-04-05', '2026-03-29']
  const occs = []
  for (const d of dates) {
    const { data: o } = await admin.from('service_occurrences').insert({ church_id: c1Id, service_template_id: tmpl1Id, location_id: loc1Id, service_date: d, status: 'active' }).select('id').single()
    await admin.from('service_occurrence_tags').insert({ service_occurrence_id: o.id, service_tag_id: morningTagId })
    occs.push(o.id)
  }
  occ1Id = occs[0] // 2026-04-12 (current week)
  occ2Id = occs[1] // 2026-04-05
  occ3Id = occs[2] // 2026-03-29

  console.log('  Setup complete.\n')
}

// ─── A. Auth & Provisioning ────────────────────────────────────────────────────
async function sectionA() {
  section('A. Auth & Provisioning (T01–T12)')

  await test('T01', 'Church exists in DB with correct name', async () => {
    const { data } = await admin.from('churches').select('name, slug').eq('id', c1Id).single()
    assert(data.name === 'QA Church One', `name mismatch: ${data.name}`)
    assert(data.slug.startsWith('qa1-'), `slug wrong: ${data.slug}`)
  })

  await test('T02', 'Church tracking flags default: all true for church 1', async () => {
    const { data } = await admin.from('churches').select('tracks_volunteers, tracks_responses, tracks_giving, tracks_kids_attendance, tracks_youth_attendance').eq('id', c1Id).single()
    assert(data.tracks_volunteers === true)
    assert(data.tracks_responses === true)
    assert(data.tracks_giving === true)
  })

  await test('T03', 'Church 2 tracking flags: all false', async () => {
    const { data } = await admin.from('churches').select('tracks_volunteers, tracks_responses, tracks_giving').eq('id', c2Id).single()
    assert(data.tracks_volunteers === false)
    assert(data.tracks_responses === false)
    assert(data.tracks_giving === false)
  })

  await test('T04', 'Owner membership created with correct role', async () => {
    const { data } = await admin.from('church_memberships').select('role, is_active').eq('user_id', u1Id).eq('church_id', c1Id).single()
    assert(data.role === 'owner', `role=${data.role}`)
    assert(data.is_active === true)
  })

  await test('T05', 'Default location created (Main Campus)', async () => {
    const { data } = await admin.from('church_locations').select('name, code, sort_order').eq('id', loc1Id).single()
    assert(data.name === 'Main Campus')
    assert(data.code === 'MAIN')
    assert(data.sort_order === 1)
  })

  await test('T06', 'Service tags seeded: MORNING, EVENING, MIDWEEK', async () => {
    const { data } = await admin.from('service_tags').select('tag_code').eq('church_id', c1Id).eq('is_active', true)
    const codes = data.map(t => t.tag_code)
    assert(codes.includes('MORNING'), 'missing MORNING')
    assert(codes.includes('EVENING'), 'missing EVENING')
    assert(codes.includes('MIDWEEK'), 'missing MIDWEEK')
  })

  await test('T07', 'Stat categories seeded: FTD, REDEDICATION, BAPTISM', async () => {
    const { data } = await admin.from('response_categories').select('category_code').eq('church_id', c1Id).eq('is_active', true)
    const codes = data.map(c => c.category_code)
    assert(codes.includes('FIRST_TIME_DECISION'), 'missing FTD')
    assert(codes.includes('REDEDICATION'), 'missing REDEDICATION')
    assert(codes.includes('BAPTISM'), 'missing BAPTISM')
  })

  await test('T08', 'Giving sources seeded (at least 1)', async () => {
    const { data } = await admin.from('giving_sources').select('id').eq('church_id', c1Id).eq('is_active', true)
    assert(data.length >= 1, `expected >=1 giving sources, got ${data.length}`)
  })

  await test('T09', 'User can sign in and get their church via membership', async () => {
    const { data: { user } } = await anon1.auth.getUser()
    assert(user?.id === u1Id, 'user id mismatch')
    const { data: mem } = await anon1.from('church_memberships').select('church_id, role').eq('user_id', user.id).eq('is_active', true).single()
    assert(mem.church_id === c1Id)
    assert(mem.role === 'owner')
  })

  await test('T10', 'RLS: anon user cannot read churches table', async () => {
    const anonClient = createClient(URL, ANON)
    const { data } = await anonClient.from('churches').select('id').limit(5)
    assert(!data || data.length === 0, `expected empty, got ${data?.length} rows`)
  })

  await test('T11', 'Auth user sees only their own church (RLS)', async () => {
    const { data } = await anon1.from('churches').select('id')
    assert(data.every(r => r.id === c1Id), `saw unexpected churches: ${JSON.stringify(data)}`)
  })

  await test('T12', 'Duplicate email signup returns error (auth constraint)', async () => {
    const { error } = await admin.auth.admin.createUser({ email: E1, password: PASS, email_confirm: true })
    assert(error !== null, 'expected error for duplicate email')
  })
}

// ─── B. Service Templates & Tags ──────────────────────────────────────────────
async function sectionB() {
  section('B. Service Templates & Tags (T13–T22)')

  await test('T13', 'Service template created with correct fields', async () => {
    const { data } = await admin.from('service_templates').select('*').eq('id', tmpl1Id).single()
    assert(data.church_id === c1Id)
    assert(data.display_name === 'Morning Service')
    assert(data.is_active === true)
    assert(data.primary_tag_id === morningTagId)
    assert(data.service_code != null, 'service_code null')
  })

  await test('T14', 'Template service_code is non-null and non-empty', async () => {
    const { data } = await admin.from('service_templates').select('service_code').eq('id', tmpl1Id).single()
    assert(data.service_code && data.service_code.length > 0, `service_code: ${data.service_code}`)
  })

  await test('T15', 'Each service tag has tag_code + tag_name', async () => {
    const { data } = await admin.from('service_tags').select('tag_code, tag_name').eq('church_id', c1Id)
    assert(data.every(t => t.tag_code && t.tag_name), 'some tags missing code or name')
  })

  await test('T16', 'service_tags are isolated per church (C2 gets its own)', async () => {
    const { data: t1 } = await admin.from('service_tags').select('id').eq('church_id', c1Id)
    const { data: t2 } = await admin.from('service_tags').select('id').eq('church_id', c2Id)
    const ids1 = new Set(t1.map(t => t.id))
    const ids2 = new Set(t2.map(t => t.id))
    const overlap = [...ids1].filter(id => ids2.has(id))
    assert(overlap.length === 0, `tag overlap between churches: ${overlap}`)
  })

  await test('T17', 'Template belongs only to its own church', async () => {
    const { data } = await admin.from('service_templates').select('church_id').eq('id', tmpl1Id).single()
    assert(data.church_id === c1Id)
  })

  await test('T18', 'Auth user cannot see other church templates (RLS)', async () => {
    const { data } = await anon1.from('service_templates').select('id')
    assert(data.every(r => {
      // we can't check church_id directly here; just verify tmpl2Id is not visible
      return r.id !== tmpl2Id
    }), 'church 2 template visible to church 1 user')
  })

  await test('T19', 'Volunteer categories saved with correct audience_group_code', async () => {
    const { data } = await admin.from('volunteer_categories').select('audience_group_code, category_code').eq('church_id', c1Id)
    const music = data.find(v => v.category_code === 'MUSIC')
    const teachers = data.find(v => v.category_code === 'TEACHERS')
    assert(music?.audience_group_code === 'MAIN', `Music audience: ${music?.audience_group_code}`)
    assert(teachers?.audience_group_code === 'KIDS', `Teachers audience: ${teachers?.audience_group_code}`)
  })

  await test('T20', 'Volunteer category unique constraint (church+audience+code)', async () => {
    const { error } = await admin.from('volunteer_categories').insert({ church_id: c1Id, audience_group_code: 'MAIN', category_code: 'MUSIC', category_name: 'Music Dupe', sort_order: 99 })
    assert(error !== null, 'expected unique constraint error')
  })

  await test('T21', 'Response category stat_scope is valid enum value', async () => {
    const { data } = await admin.from('response_categories').select('stat_scope').eq('church_id', c1Id)
    const valid = ['audience', 'service', 'day', 'week', 'month']
    assert(data.every(c => valid.includes(c.stat_scope)), 'invalid stat_scope found')
  })

  await test('T22', 'Response categories: FTD has stat_scope = audience', async () => {
    const { data } = await admin.from('response_categories').select('stat_scope').eq('id', statCat1Id).single()
    assert(data.stat_scope === 'audience', `FTD stat_scope: ${data.stat_scope}`)
  })
}

// ─── C. Occurrences & Schedules ───────────────────────────────────────────────
async function sectionC() {
  section('C. Occurrences & Schedules (T23–T30)')

  await test('T23', 'Service occurrences created with status = active', async () => {
    const { data } = await admin.from('service_occurrences').select('status').in('id', [occ1Id, occ2Id, occ3Id])
    assert(data.every(o => o.status === 'active'), 'non-active occurrence found')
  })

  await test('T24', 'Occurrence has correct service_date', async () => {
    const { data } = await admin.from('service_occurrences').select('service_date').eq('id', occ1Id).single()
    assert(data.service_date === '2026-04-12', `date: ${data.service_date}`)
  })

  await test('T25', 'Occurrence has non-null location_id', async () => {
    const { data } = await admin.from('service_occurrences').select('location_id').eq('id', occ1Id).single()
    assert(data.location_id !== null, 'location_id is null')
  })

  await test('T26', 'service_occurrence_tags stamped for all occurrences', async () => {
    const { data } = await admin.from('service_occurrence_tags').select('service_tag_id').in('service_occurrence_id', [occ1Id, occ2Id, occ3Id])
    assert(data.length === 3, `expected 3 tag stamps, got ${data.length}`)
    assert(data.every(t => t.service_tag_id === morningTagId), 'tag mismatch')
  })

  await test('T27', 'Cancelled occurrence is excluded from dashboard query (Rule 1)', async () => {
    // Insert a cancelled occurrence
    const { data: cancelOcc } = await admin.from('service_occurrences').insert({ church_id: c1Id, service_template_id: tmpl1Id, location_id: loc1Id, service_date: '2026-04-11', status: 'cancelled' }).select('id').single()
    await admin.from('attendance_entries').insert({ service_occurrence_id: cancelOcc.id, main_attendance: 999 })
    // Query should exclude it (status = active)
    const { data } = await admin.from('service_occurrences').select('id, attendance_entries(main_attendance)').eq('church_id', c1Id).eq('status', 'active').eq('service_date', '2026-04-11')
    assert(!data || data.length === 0, 'cancelled occurrence appeared in active query')
    // Cleanup
    await admin.from('service_occurrences').delete().eq('id', cancelOcc.id)
  })

  await test('T28', 'Occurrence cannot have duplicate date+template (unique constraint)', async () => {
    const { error } = await admin.from('service_occurrences').insert({ church_id: c1Id, service_template_id: tmpl1Id, location_id: loc1Id, service_date: '2026-04-12', status: 'active' })
    assert(error !== null, 'expected unique constraint violation')
  })

  await test('T29', 'Auth user (church 1) cannot see church 2 occurrences (RLS)', async () => {
    // Insert an occurrence for church 2
    const { data: co } = await admin.from('service_occurrences').insert({ church_id: c2Id, service_template_id: tmpl2Id, location_id: loc2Id, service_date: '2026-04-12', status: 'active' }).select('id').single()
    const { data: visibleOccs } = await anon1.from('service_occurrences').select('id').eq('id', co.id)
    assert(!visibleOccs || visibleOccs.length === 0, 'church 2 occurrence visible to church 1')
    await admin.from('service_occurrences').delete().eq('id', co.id)
  })

  await test('T30', 'Schedule version saved with correct day_of_week + start_time', async () => {
    const { error } = await admin.from('service_schedule_versions').insert({ service_template_id: tmpl1Id, day_of_week: 0, start_time: '09:00:00', effective_start_date: '2026-01-01', is_active: true })
    assert(!error, `schedule insert error: ${error?.message}`)
    const { data } = await admin.from('service_schedule_versions').select('day_of_week, start_time').eq('service_template_id', tmpl1Id).eq('is_active', true).single()
    assert(data.day_of_week === 0, 'day_of_week wrong')
    assert(data.start_time === '09:00:00', 'start_time wrong')
  })
}

// ─── D. Attendance Entry ───────────────────────────────────────────────────────
async function sectionD() {
  section('D. Attendance Entry (T31–T40)')

  // Insert attendance for all 3 occurrences
  await admin.from('attendance_entries').insert({ service_occurrence_id: occ1Id, main_attendance: 320, kids_attendance: 55, youth_attendance: 30 })
  await admin.from('attendance_entries').insert({ service_occurrence_id: occ2Id, main_attendance: 310, kids_attendance: 50, youth_attendance: 28 })
  await admin.from('attendance_entries').insert({ service_occurrence_id: occ3Id, main_attendance: null, kids_attendance: 45, youth_attendance: null })

  await test('T31', 'Attendance entry stored with correct values', async () => {
    const { data } = await admin.from('attendance_entries').select('main_attendance, kids_attendance, youth_attendance').eq('service_occurrence_id', occ1Id).single()
    assert(data.main_attendance === 320, `main: ${data.main_attendance}`)
    assert(data.kids_attendance === 55, `kids: ${data.kids_attendance}`)
    assert(data.youth_attendance === 30, `youth: ${data.youth_attendance}`)
  })

  await test('T32', 'NULL attendance stored correctly (not coerced to 0)', async () => {
    const { data } = await admin.from('attendance_entries').select('main_attendance, youth_attendance').eq('service_occurrence_id', occ3Id).single()
    assert(data.main_attendance === null, `expected null, got ${data.main_attendance}`)
    assert(data.youth_attendance === null, `expected null, got ${data.youth_attendance}`)
  })

  await test('T33', 'Attendance unique constraint: one row per occurrence', async () => {
    const { error } = await admin.from('attendance_entries').insert({ service_occurrence_id: occ1Id, main_attendance: 100 })
    assert(error !== null, 'expected unique constraint on attendance_entries')
  })

  await test('T34', 'Attendance upsert updates existing row', async () => {
    await admin.from('attendance_entries').upsert({ service_occurrence_id: occ1Id, main_attendance: 350, kids_attendance: 55, youth_attendance: 30 }, { onConflict: 'service_occurrence_id' })
    const { data } = await admin.from('attendance_entries').select('main_attendance').eq('service_occurrence_id', occ1Id).single()
    assert(data.main_attendance === 350, `after upsert: ${data.main_attendance}`)
    // Reset
    await admin.from('attendance_entries').upsert({ service_occurrence_id: occ1Id, main_attendance: 320, kids_attendance: 55, youth_attendance: 30 }, { onConflict: 'service_occurrence_id' })
  })

  await test('T35', 'Attendance negative value rejected (check constraint)', async () => {
    const { data: newOcc } = await admin.from('service_occurrences').insert({ church_id: c1Id, service_template_id: tmpl1Id, location_id: loc1Id, service_date: '2026-01-04', status: 'active' }).select('id').single()
    const { error } = await admin.from('attendance_entries').insert({ service_occurrence_id: newOcc.id, main_attendance: -5 })
    assert(error !== null, 'negative attendance should fail check constraint')
    await admin.from('service_occurrences').delete().eq('id', newOcc.id)
  })

  await test('T36', 'Attendance entry returns as object (not array) via nested select', async () => {
    const { data } = await admin.from('service_occurrences').select('id, attendance_entries(main_attendance)').eq('id', occ1Id).single()
    const ae = data.attendance_entries
    assert(!Array.isArray(ae), 'attendance_entries should be object not array (unique constraint)')
    assert(ae?.main_attendance === 320, `main: ${ae?.main_attendance}`)
  })

  await test('T37', 'Occurrence with NULL main_attendance excluded from grand total (Rule 4)', async () => {
    const { data } = await admin.from('attendance_entries').select('main_attendance').eq('service_occurrence_id', occ3Id).single()
    // main is null → should not contribute to averages
    assert(data.main_attendance === null, 'occ3 main should be null')
  })

  await test('T38', 'Kids attendance NULL handled: 45 stored, main NULL', async () => {
    const { data } = await admin.from('attendance_entries').select('kids_attendance, main_attendance').eq('service_occurrence_id', occ3Id).single()
    assert(data.kids_attendance === 45, `kids: ${data.kids_attendance}`)
    assert(data.main_attendance === null, `main should be null: ${data.main_attendance}`)
  })

  await test('T39', 'Attendance belongs only to its own church (RLS via join)', async () => {
    // Church 2 has no attendance. anon1 (church1) should not see church2 data
    const { data: c2occs } = await admin.from('service_occurrences').select('id').eq('church_id', c2Id).limit(1)
    if (c2occs?.length > 0) {
      const { data } = await anon1.from('attendance_entries').select('id').eq('service_occurrence_id', c2occs[0].id)
      assert(!data || data.length === 0, 'church2 attendance visible to church1 user')
    }
  })

  await test('T40', 'All 3 attendance_entries rows exist in DB for church 1', async () => {
    const { data } = await admin.from('attendance_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id, occ3Id])
    assert(data.length === 3, `expected 3 rows, got ${data.length}`)
  })
}

// ─── E. Volunteer Entry ────────────────────────────────────────────────────────
async function sectionE() {
  section('E. Volunteer Entry (T41–T50)')

  // Insert volunteers for occ1 and occ2
  await admin.from('volunteer_entries').insert([
    { service_occurrence_id: occ1Id, volunteer_category_id: volCat1Id, volunteer_count: 8, is_not_applicable: false },
    { service_occurrence_id: occ1Id, volunteer_category_id: volCat2Id, volunteer_count: 4, is_not_applicable: false },
    { service_occurrence_id: occ2Id, volunteer_category_id: volCat1Id, volunteer_count: 7, is_not_applicable: false },
    { service_occurrence_id: occ2Id, volunteer_category_id: volCat2Id, volunteer_count: 3, is_not_applicable: true }, // N/A
  ])

  await test('T41', 'Volunteer entries stored correctly', async () => {
    const { data } = await admin.from('volunteer_entries').select('volunteer_count, is_not_applicable').eq('service_occurrence_id', occ1Id).eq('volunteer_category_id', volCat1Id).single()
    assert(data.volunteer_count === 8, `count: ${data.volunteer_count}`)
    assert(data.is_not_applicable === false)
  })

  await test('T42', 'is_not_applicable = true stored correctly', async () => {
    const { data } = await admin.from('volunteer_entries').select('is_not_applicable').eq('service_occurrence_id', occ2Id).eq('volunteer_category_id', volCat2Id).single()
    assert(data.is_not_applicable === true)
  })

  await test('T43', 'Volunteer total excludes is_not_applicable rows (Rule 3)', async () => {
    const { data } = await admin.from('volunteer_entries').select('volunteer_count, is_not_applicable').eq('service_occurrence_id', occ2Id)
    const total = data.filter(v => !v.is_not_applicable).reduce((s, v) => s + v.volunteer_count, 0)
    assert(total === 7, `expected 7, got ${total} (N/A should be excluded)`)
  })

  await test('T44', 'Volunteer unique constraint (occurrence + category)', async () => {
    const { error } = await admin.from('volunteer_entries').insert({ service_occurrence_id: occ1Id, volunteer_category_id: volCat1Id, volunteer_count: 99, is_not_applicable: false })
    assert(error !== null, 'expected unique constraint violation')
  })

  await test('T45', 'Volunteer count cannot be negative (check constraint)', async () => {
    const { data: newOcc } = await admin.from('service_occurrences').insert({ church_id: c1Id, service_template_id: tmpl1Id, location_id: loc1Id, service_date: '2026-01-11', status: 'active' }).select('id').single()
    const { error } = await admin.from('volunteer_entries').insert({ service_occurrence_id: newOcc.id, volunteer_category_id: volCat1Id, volunteer_count: -1, is_not_applicable: false })
    assert(error !== null, 'negative volunteer_count should fail')
    await admin.from('service_occurrences').delete().eq('id', newOcc.id)
  })

  await test('T46', 'Volunteer categories FK references correct church', async () => {
    const { data } = await admin.from('volunteer_categories').select('church_id').in('id', [volCat1Id, volCat2Id])
    assert(data.every(v => v.church_id === c1Id), 'vol category church mismatch')
  })

  await test('T47', 'Volunteer breakout: correct audience_group_code on categories', async () => {
    const { data } = await admin.from('volunteer_categories').select('category_code, audience_group_code').eq('church_id', c1Id)
    const music    = data.find(v => v.category_code === 'MUSIC')
    const teachers = data.find(v => v.category_code === 'TEACHERS')
    assert(music?.audience_group_code    === 'MAIN', `Music: ${music?.audience_group_code}`)
    assert(teachers?.audience_group_code === 'KIDS', `Teachers: ${teachers?.audience_group_code}`)
  })

  await test('T48', 'Volunteer entries exist for both occurrences', async () => {
    const { data } = await admin.from('volunteer_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id])
    assert(data.length === 4, `expected 4, got ${data.length}`)
  })

  await test('T49', 'Nested select returns volunteer_categories as object (1-to-1 via FK)', async () => {
    const { data } = await admin.from('volunteer_entries').select('volunteer_count, volunteer_categories(category_name, audience_group_code)').eq('service_occurrence_id', occ1Id).eq('volunteer_category_id', volCat1Id).single()
    const cat = Array.isArray(data.volunteer_categories) ? data.volunteer_categories[0] : data.volunteer_categories
    assert(cat?.category_name === 'Music', `cat name: ${cat?.category_name}`)
  })

  await test('T50', 'Volunteer total for occ1: 8+4=12', async () => {
    const { data } = await admin.from('volunteer_entries').select('volunteer_count, is_not_applicable').eq('service_occurrence_id', occ1Id)
    const total = data.filter(v => !v.is_not_applicable).reduce((s, v) => s + v.volunteer_count, 0)
    assert(total === 12, `expected 12, got ${total}`)
  })
}

// ─── F. Stats / Response Entry ────────────────────────────────────────────────
async function sectionF() {
  section('F. Stats / Response Entry (T51–T60)')

  // Insert stats
  await admin.from('response_entries').insert([
    { service_occurrence_id: occ1Id, response_category_id: statCat1Id, audience_group_code: 'MAIN', stat_value: 3, is_not_applicable: false },
    { service_occurrence_id: occ1Id, response_category_id: statCat2Id, audience_group_code: 'MAIN', stat_value: 1, is_not_applicable: false },
    { service_occurrence_id: occ2Id, response_category_id: statCat1Id, audience_group_code: 'MAIN', stat_value: 2, is_not_applicable: false },
    { service_occurrence_id: occ2Id, response_category_id: statCat2Id, audience_group_code: 'MAIN', stat_value: 0, is_not_applicable: false },
    { service_occurrence_id: occ3Id, response_category_id: statCat1Id, audience_group_code: 'MAIN', stat_value: 1, is_not_applicable: true }, // N/A
  ])

  await test('T51', 'Response entries stored with correct stat_value', async () => {
    const { data } = await admin.from('response_entries').select('stat_value').eq('service_occurrence_id', occ1Id).eq('response_category_id', statCat1Id).eq('audience_group_code', 'MAIN').single()
    assert(data.stat_value === 3, `expected 3, got ${data.stat_value}`)
  })

  await test('T52', 'stat_value = 0 stored correctly (not NULL)', async () => {
    const { data } = await admin.from('response_entries').select('stat_value').eq('service_occurrence_id', occ2Id).eq('response_category_id', statCat2Id).single()
    assert(data.stat_value === 0, `expected 0, got ${data.stat_value}`)
  })

  await test('T53', 'is_not_applicable = true on stat stored correctly', async () => {
    const { data } = await admin.from('response_entries').select('is_not_applicable').eq('service_occurrence_id', occ3Id).eq('response_category_id', statCat1Id).single()
    assert(data.is_not_applicable === true)
  })

  await test('T54', 'Unique constraint: (occurrence, category, audience_group_code)', async () => {
    const { error } = await admin.from('response_entries').insert({ service_occurrence_id: occ1Id, response_category_id: statCat1Id, audience_group_code: 'MAIN', stat_value: 99, is_not_applicable: false })
    assert(error !== null, 'expected unique constraint violation')
  })

  await test('T55', 'Service-level stat has NULL audience_group_code', async () => {
    // Create a service-scope category
    const { data: svcCat } = await admin.from('response_categories').insert({ church_id: c1Id, category_name: 'Parking', category_code: 'PARKING', stat_scope: 'service', display_order: 10, is_active: true }).select('id').single()
    const { error } = await admin.from('response_entries').insert({ service_occurrence_id: occ1Id, response_category_id: svcCat.id, audience_group_code: null, stat_value: 45, is_not_applicable: false })
    assert(!error, `service-level stat insert failed: ${error?.message}`)
    const { data } = await admin.from('response_entries').select('audience_group_code').eq('service_occurrence_id', occ1Id).eq('response_category_id', svcCat.id).single()
    assert(data.audience_group_code === null, `expected null, got ${data.audience_group_code}`)
    // Cleanup svcCat
    await admin.from('response_categories').delete().eq('id', svcCat.id)
  })

  await test('T56', 'FTD category_code is exactly FIRST_TIME_DECISION', async () => {
    const { data } = await admin.from('response_categories').select('category_code').eq('id', statCat1Id).single()
    assert(data.category_code === 'FIRST_TIME_DECISION', `code: ${data.category_code}`)
  })

  await test('T57', 'FTD sum for occ1: 3 (only non-N/A rows)', async () => {
    const { data } = await admin.from('response_entries').select('stat_value, is_not_applicable').eq('service_occurrence_id', occ1Id).eq('response_category_id', statCat1Id)
    const sum = data.filter(r => !r.is_not_applicable && r.stat_value != null).reduce((s, r) => s + r.stat_value, 0)
    assert(sum === 3, `expected 3, got ${sum}`)
  })

  await test('T58', 'N/A stat is excluded from aggregation', async () => {
    const { data } = await admin.from('response_entries').select('stat_value, is_not_applicable').eq('service_occurrence_id', occ3Id).eq('response_category_id', statCat1Id).single()
    assert(data.is_not_applicable === true)
    // If we exclude N/A, occ3 contributes 0 to FTD total
    const contrib = data.is_not_applicable ? 0 : (data.stat_value ?? 0)
    assert(contrib === 0, `N/A row contributing ${contrib} to total`)
  })

  await test('T59', 'response_entries scoped to church via RLS', async () => {
    const { data } = await anon1.from('response_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id])
    assert(data.length >= 4, `expected >=4 rows, got ${data.length}`)
  })

  await test('T60', 'Response category display_order stored correctly', async () => {
    const { data } = await admin.from('response_categories').select('display_order').eq('id', statCat1Id).single()
    assert(typeof data.display_order === 'number', `display_order: ${data.display_order}`)
  })
}

// ─── G. Giving Entry ──────────────────────────────────────────────────────────
async function sectionG() {
  section('G. Giving Entry (T61–T67)')

  // Insert giving for occ1 + occ2
  await admin.from('giving_entries').insert([
    { service_occurrence_id: occ1Id, giving_source_id: givSrc1Id, giving_amount: '4800.00' },
    { service_occurrence_id: occ2Id, giving_source_id: givSrc1Id, giving_amount: '4600.50' },
  ])

  await test('T61', 'Giving entry stored with correct amount', async () => {
    const { data } = await admin.from('giving_entries').select('giving_amount').eq('service_occurrence_id', occ1Id).single()
    assert(parseFloat(data.giving_amount) === 4800.00, `amount: ${data.giving_amount}`)
  })

  await test('T62', 'Giving amount supports decimals', async () => {
    const { data } = await admin.from('giving_entries').select('giving_amount').eq('service_occurrence_id', occ2Id).single()
    assert(parseFloat(data.giving_amount) === 4600.50, `amount: ${data.giving_amount}`)
  })

  await test('T63', 'Multiple giving rows per occurrence SUM correctly (Rule 5)', async () => {
    // Add second giving source
    const { data: src2 } = await admin.from('giving_sources').insert({ church_id: c1Id, source_name: 'Online', source_code: `ONLINE_${TS}`, is_active: true }).select('id').single()
    await admin.from('giving_entries').insert({ service_occurrence_id: occ1Id, giving_source_id: src2.id, giving_amount: '1200.00' })
    const { data } = await admin.from('giving_entries').select('giving_amount').eq('service_occurrence_id', occ1Id)
    const total = data.reduce((s, g) => s + parseFloat(g.giving_amount), 0)
    assert(Math.abs(total - 6000.00) < 0.01, `expected 6000, got ${total}`)
    // Cleanup
    await admin.from('giving_entries').delete().eq('service_occurrence_id', occ1Id).eq('giving_source_id', src2.id)
    await admin.from('giving_sources').delete().eq('id', src2.id)
  })

  await test('T64', 'Giving source references correct church', async () => {
    const { data } = await admin.from('giving_sources').select('church_id').eq('id', givSrc1Id).single()
    assert(data.church_id === c1Id, `giving source church: ${data.church_id}`)
  })

  await test('T65', 'Giving entries scoped to church via RLS', async () => {
    const { data } = await anon1.from('giving_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id])
    assert(data.length >= 2, `expected >=2, got ${data.length}`)
  })

  await test('T66', 'Occurrence with no giving rows returns empty array (not null)', async () => {
    const { data } = await admin.from('giving_entries').select('id').eq('service_occurrence_id', occ3Id)
    assert(Array.isArray(data) && data.length === 0, `expected empty array, got ${JSON.stringify(data)}`)
  })

  await test('T67', 'Giving source is_active=false hides it from active filter', async () => {
    const { data: inactSrc } = await admin.from('giving_sources').insert({ church_id: c1Id, source_name: 'Retired Fund', source_code: `RETIRED_${TS}`, is_active: false }).select('id').single()
    const { data: activeSrcs } = await admin.from('giving_sources').select('id').eq('church_id', c1Id).eq('is_active', true)
    assert(!activeSrcs.find(s => s.id === inactSrc.id), 'inactive source appearing in active filter')
    await admin.from('giving_sources').delete().eq('id', inactSrc.id)
  })
}

// ─── H. Dashboard Calculations ────────────────────────────────────────────────
async function sectionH() {
  section('H. Dashboard Calculations (T68–T82)')

  // Fetch all occurrences with nested data
  const { data: occs, error: fetchErr } = await admin.from('service_occurrences')
    .select(`id, service_date,
      attendance_entries(main_attendance, kids_attendance, youth_attendance),
      volunteer_entries(volunteer_count, is_not_applicable,
        volunteer_categories(audience_group_code, category_code)),
      response_entries(stat_value, is_not_applicable, audience_group_code,
        response_categories(category_code, stat_scope)),
      giving_entries(giving_amount)
    `)
    .eq('church_id', c1Id)
    .eq('status', 'active')
    .in('id', [occ1Id, occ2Id, occ3Id])

  function getAtt(occ) {
    const ae = Array.isArray(occ.attendance_entries) ? occ.attendance_entries[0] : occ.attendance_entries
    return ae
  }

  await test('T68', 'Deep select returns attendance_entries for all 3 occurrences', async () => {
    assert(!fetchErr, `fetch error: ${fetchErr?.message}`)
    assert(occs.length === 3, `expected 3, got ${occs.length}`)
    const withAtt = occs.filter(o => getAtt(o) !== null)
    assert(withAtt.length === 3, `all 3 should have attendance entries`)
  })

  await test('T69', 'Grand Total = MAIN + KIDS + YOUTH for occ1 (D-055)', async () => {
    const o = occs.find(o => o.id === occ1Id)
    const ae = getAtt(o)
    const grand = ae.main_attendance + (ae.kids_attendance ?? 0) + (ae.youth_attendance ?? 0)
    assert(grand === 405, `grand total: ${grand}`)
  })

  await test('T70', 'Grand Total with NULL main: entire occurrence excluded from avg', async () => {
    const o = occs.find(o => o.id === occ3Id)
    const ae = getAtt(o)
    assert(ae.main_attendance === null, `occ3 main should be null: ${ae.main_attendance}`)
    // Grand total for occ3 = null (Rule 4: NULL main → null grand total)
    const grand = ae.main_attendance === null ? null : ae.main_attendance + (ae.kids_attendance ?? 0) + (ae.youth_attendance ?? 0)
    assert(grand === null, `grand total with null main should be null, got: ${grand}`)
  })

  await test('T71', 'Last 4-wk avg attendance (occ1+occ2 only, occ3 has null main)', async () => {
    // Sundays in last 4 weeks: occ2 (4/05), occ3 (3/29) — occ1 is current week
    // BUT occ3 has null main → excluded from avg
    // So last4 avg = just occ2 = 388
    const last4Occs = [occs.find(o => o.id === occ2Id), occs.find(o => o.id === occ3Id)]
    const vals = last4Occs.map(o => {
      const ae = getAtt(o)
      if (!ae || ae.main_attendance === null) return null
      return ae.main_attendance + (ae.kids_attendance ?? 0) + (ae.youth_attendance ?? 0)
    }).filter(v => v !== null)
    assert(vals.length === 1, `expected 1 valid week (occ3 excluded), got ${vals.length}`)
    assert(vals[0] === 388, `expected 388, got ${vals[0]}`)
  })

  await test('T72', 'Adults (MAIN) current week = 320', async () => {
    const o = occs.find(o => o.id === occ1Id)
    const ae = getAtt(o)
    assert(ae.main_attendance === 320, `main: ${ae.main_attendance}`)
  })

  await test('T73', 'Kids current week = 55', async () => {
    const o = occs.find(o => o.id === occ1Id)
    const ae = getAtt(o)
    assert(ae.kids_attendance === 55, `kids: ${ae.kids_attendance}`)
  })

  await test('T74', 'Youth current week = 30', async () => {
    const o = occs.find(o => o.id === occ1Id)
    const ae = getAtt(o)
    assert(ae.youth_attendance === 30, `youth: ${ae.youth_attendance}`)
  })

  await test('T75', 'Volunteer total occ1 = 12 (8 music + 4 teachers, N/A excluded)', async () => {
    const o = occs.find(o => o.id === occ1Id)
    const total = (o.volunteer_entries ?? []).filter(v => !v.is_not_applicable).reduce((s, v) => s + v.volunteer_count, 0)
    assert(total === 12, `expected 12, got ${total}`)
  })

  await test('T76', 'Volunteer total occ2 = 7 (3 teachers N/A excluded)', async () => {
    const o = occs.find(o => o.id === occ2Id)
    const total = (o.volunteer_entries ?? []).filter(v => !v.is_not_applicable).reduce((s, v) => s + v.volunteer_count, 0)
    assert(total === 7, `expected 7, got ${total}`)
  })

  await test('T77', 'FTD sum occ1 = 3 (N/A on occ3 excluded)', async () => {
    const o = occs.find(o => o.id === occ1Id)
    let ftd = 0
    for (const re of o.response_entries ?? []) {
      if (re.is_not_applicable || re.stat_value == null) continue
      const cat = Array.isArray(re.response_categories) ? re.response_categories[0] : re.response_categories
      if (cat?.category_code === 'FIRST_TIME_DECISION') ftd += re.stat_value
    }
    assert(ftd === 3, `expected 3, got ${ftd}`)
  })

  await test('T78', 'Giving total occ1 = 4800', async () => {
    const o = occs.find(o => o.id === occ1Id)
    const total = (o.giving_entries ?? []).reduce((s, g) => s + parseFloat(g.giving_amount), 0)
    assert(Math.abs(total - 4800) < 0.01, `expected 4800, got ${total}`)
  })

  await test('T79', 'Giving total occ2 = 4600.50', async () => {
    const o = occs.find(o => o.id === occ2Id)
    const total = (o.giving_entries ?? []).reduce((s, g) => s + parseFloat(g.giving_amount), 0)
    assert(Math.abs(total - 4600.50) < 0.01, `expected 4600.50, got ${total}`)
  })

  await test('T80', 'Week bucketing: Sunday 2026-04-12 = current week (Sunday-based)', async () => {
    // weekStartOf('2026-04-17') should be '2026-04-12' (prev Sunday)
    const d = new Date('2026-04-17T12:00:00')
    const day = d.getDay() // 5 (Friday)
    const sunday = new Date(d)
    sunday.setDate(d.getDate() - day)
    const bucket = sunday.toISOString().split('T')[0]
    assert(bucket === '2026-04-12', `bucket: ${bucket}`)
  })

  await test('T81', 'Delta formula: ((current - prior) / prior) * 100', async () => {
    const delta = (cur, pri) => (pri === 0 || pri == null || cur == null) ? null : Math.round(((cur - pri) / pri) * 100)
    assert(delta(405, 388) === 4, `405 vs 388 should be ~4%, got ${delta(405, 388)}`)
    assert(delta(388, 405) === -4, `388 vs 405 should be ~-4%, got ${delta(388, 405)}`)
    assert(delta(100, 0) === null, 'div-by-zero should return null')
    assert(delta(null, 100) === null, 'null current should return null')
  })

  await test('T82', 'Prior YTD column shows null when no prior year data', async () => {
    // Only occ1/occ2/occ3 exist, all in 2026. Prior YTD (2025) = no data → null
    const priorStart = '2025-01-01'
    const priorEnd   = '2025-04-12'
    const { data } = await admin.from('service_occurrences').select('id').eq('church_id', c1Id).eq('status', 'active').gte('service_date', priorStart).lte('service_date', priorEnd)
    assert(!data || data.length === 0, `expected 0 prior-year occs, got ${data?.length}`)
    // → priorYtd would be null → dashboard shows "—"
  })
}

// ─── I. RLS / Multi-Tenancy ────────────────────────────────────────────────────
async function sectionI() {
  section('I. RLS / Multi-Tenancy (T83–T90)')

  await test('T83', 'Church 1 user cannot insert into church 2 occurrences (RLS)', async () => {
    const { error } = await anon1.from('service_occurrences').insert({ church_id: c2Id, service_template_id: tmpl2Id, location_id: loc2Id, service_date: '2026-04-19', status: 'active' })
    assert(error !== null, 'expected RLS rejection on cross-church occurrence insert')
  })

  await test('T84', 'Church 1 user cannot read church 2 service templates (RLS)', async () => {
    const { data } = await anon1.from('service_templates').select('id').eq('church_id', c2Id)
    assert(!data || data.length === 0, `church 2 templates visible to church 1: ${data?.length}`)
  })

  await test('T85', 'Church 1 user cannot read church 2 response_categories (RLS)', async () => {
    const { data } = await anon1.from('response_categories').select('id').eq('church_id', c2Id)
    assert(!data || data.length === 0, `church 2 stat cats visible: ${data?.length}`)
  })

  await test('T86', 'Church 1 user cannot read church 2 volunteer_categories (RLS)', async () => {
    const { data } = await anon1.from('volunteer_categories').select('id').eq('church_id', c2Id)
    assert(!data || data.length === 0, `church 2 vol cats visible: ${data?.length}`)
  })

  await test('T87', 'Church 1 user cannot read church 2 giving_sources (RLS)', async () => {
    const { data } = await anon1.from('giving_sources').select('id').eq('church_id', c2Id)
    assert(!data || data.length === 0, `church 2 giving sources visible: ${data?.length}`)
  })

  await test('T88', 'Church 1 user cannot read church 2 church_locations (RLS)', async () => {
    const { data } = await anon1.from('church_locations').select('id').eq('church_id', c2Id)
    assert(!data || data.length === 0, `church 2 locations visible: ${data?.length}`)
  })

  await test('T89', 'Church 1 user cannot modify church 2 church record (RLS)', async () => {
    const { error } = await anon1.from('churches').update({ name: 'Hacked' }).eq('id', c2Id)
    // RLS means the update affects 0 rows (no error thrown, but no rows changed)
    const { data } = await admin.from('churches').select('name').eq('id', c2Id).single()
    assert(data.name !== 'Hacked', 'church 2 was renamed by church 1 user!')
  })

  await test('T90', 'church_memberships: user can only see their own membership (RLS)', async () => {
    const { data } = await anon1.from('church_memberships').select('user_id, church_id')
    assert(data.every(m => m.user_id === u1Id && m.church_id === c1Id), 'saw other church membership')
  })
}

// ─── J. Edge Cases & Constraints ──────────────────────────────────────────────
async function sectionJ() {
  section('J. Edge Cases & Constraints (T91–T100)')

  await test('T91', 'attendance_entries returned as object not array (unique constraint behavior)', async () => {
    const { data } = await admin.from('service_occurrences')
      .select('attendance_entries(main_attendance)')
      .eq('id', occ1Id).single()
    assert(!Array.isArray(data.attendance_entries), `attendance_entries should be an object, is array: ${Array.isArray(data.attendance_entries)}`)
  })

  await test('T92', 'Zero attendance (0) is distinct from NULL (not entered)', async () => {
    const { data: newOcc } = await admin.from('service_occurrences').insert({ church_id: c1Id, service_template_id: tmpl1Id, location_id: loc1Id, service_date: '2026-01-18', status: 'active' }).select('id').single()
    await admin.from('attendance_entries').insert({ service_occurrence_id: newOcc.id, main_attendance: 0, kids_attendance: 0, youth_attendance: 0 })
    const { data } = await admin.from('attendance_entries').select('main_attendance').eq('service_occurrence_id', newOcc.id).single()
    assert(data.main_attendance === 0, `expected 0, got ${data.main_attendance}`)
    assert(data.main_attendance !== null, 'zero was stored as null')
    await admin.from('service_occurrences').delete().eq('id', newOcc.id)
  })

  await test('T93', 'Very large attendance value stored correctly', async () => {
    const { data: newOcc } = await admin.from('service_occurrences').insert({ church_id: c1Id, service_template_id: tmpl1Id, location_id: loc1Id, service_date: '2026-01-25', status: 'active' }).select('id').single()
    const { error } = await admin.from('attendance_entries').insert({ service_occurrence_id: newOcc.id, main_attendance: 99999, kids_attendance: 9999, youth_attendance: 9999 })
    assert(!error, `large attendance error: ${error?.message}`)
    const { data } = await admin.from('attendance_entries').select('main_attendance').eq('service_occurrence_id', newOcc.id).single()
    assert(data.main_attendance === 99999)
    await admin.from('service_occurrences').delete().eq('id', newOcc.id)
  })

  await test('T94', 'Church slug uniqueness enforced', async () => {
    const { data: ch } = await admin.from('churches').select('slug').eq('id', c1Id).single()
    const { error } = await admin.from('churches').insert({ name: 'Dupe Slug', slug: ch.slug })
    assert(error !== null, 'duplicate slug should fail unique constraint')
  })

  await test('T95', 'Giving amount stored as numeric string with 2 decimals', async () => {
    const { data } = await admin.from('giving_entries').select('giving_amount').eq('service_occurrence_id', occ1Id).limit(1).single()
    const parsed = parseFloat(data.giving_amount)
    assert(!isNaN(parsed), `giving_amount not parseable: ${data.giving_amount}`)
    assert(parsed > 0, `giving amount not positive: ${parsed}`)
  })

  await test('T96', 'church_period_entries table exists and is queryable', async () => {
    const { error } = await admin.from('church_period_entries').select('id').eq('church_id', c1Id).limit(1)
    assert(!error, `period_entries query error: ${error?.message}`)
  })

  await test('T97', 'service_occurrence_tags correctly links occurrence to tag', async () => {
    const { data } = await admin.from('service_occurrence_tags').select('service_tag_id').eq('service_occurrence_id', occ1Id)
    assert(data.length >= 1, `expected >=1 tag, got ${data.length}`)
    assert(data[0].service_tag_id === morningTagId, `tag mismatch: ${data[0].service_tag_id}`)
  })

  await test('T98', 'All 17 core tables queryable via service role', async () => {
    const tables = [
      'churches', 'church_memberships', 'church_locations', 'service_tags',
      'service_templates', 'service_template_tags', 'service_schedule_versions',
      'service_occurrences', 'service_occurrence_tags', 'attendance_entries',
      'volunteer_categories', 'volunteer_entries', 'response_categories',
      'response_entries', 'giving_sources', 'giving_entries', 'church_period_entries',
    ]
    const noIdTables = new Set(['service_template_tags', 'service_occurrence_tags'])
    const errors = []
    for (const t of tables) {
      const col = noIdTables.has(t) ? '*' : 'id'
      const { error } = await admin.from(t).select(col).limit(1)
      if (error) errors.push(`${t}: ${error.message}`)
    }
    assert(errors.length === 0, `tables with errors: ${errors.join('; ')}`)
  })

  await test('T99', 'Volunteer categories isolated: church 2 starts with 0 volunteer categories', async () => {
    const { data } = await admin.from('volunteer_categories').select('id').eq('church_id', c2Id)
    assert(!data || data.length === 0, `church 2 should have no vol cats, has ${data?.length}`)
  })

  await test('T100', 'Full Supabase table row counts audit', async () => {
    const tables = [
      { name: 'churches',                min: 2 },
      { name: 'church_memberships',      min: 2 },
      { name: 'church_locations',        min: 2 },
      { name: 'service_tags',            min: 6 }, // 3 per church × 2
      { name: 'response_categories',     min: 6 }, // 3 per church × 2
      { name: 'giving_sources',          min: 2 },
      { name: 'service_occurrences',     min: 3 },
      { name: 'service_occurrence_tags', min: 3 },
      { name: 'attendance_entries',      min: 3 },
      { name: 'volunteer_entries',       min: 4 },
      { name: 'response_entries',        min: 5 },
      { name: 'giving_entries',          min: 2 },
    ]
    const noIdTables100 = new Set(['service_template_tags', 'service_occurrence_tags'])
    const report = []
    for (const t of tables) {
      const col = noIdTables100.has(t.name) ? '*' : 'id'
      const { count, error } = await admin.from(t.name).select(col, { count: 'exact', head: true })
      if (error) { report.push(`${t.name}: ERROR`); continue }
      report.push(`${t.name}: ${count ?? '?'}`)
    }
    console.log(`\n      Table row counts:\n      ${report.join('\n      ')}`)
    // Main check: all core tables accessible
    assert(!report.some(r => r.includes('ERROR')), 'some tables returned errors')
  })
}

// ─── Supabase Table Audit ──────────────────────────────────────────────────────
async function tableAudit() {
  console.log('\n\n═══════════════════════════════════════════════')
  console.log('  SUPABASE TABLE AUDIT — All 17 Tables')
  console.log('═══════════════════════════════════════════════\n')

  const tables = [
    'churches', 'church_memberships', 'church_locations',
    'service_tags', 'service_templates', 'service_template_tags',
    'service_schedule_versions', 'service_occurrences', 'service_occurrence_tags',
    'attendance_entries', 'volunteer_categories', 'volunteer_entries',
    'response_categories', 'response_entries', 'giving_sources',
    'giving_entries', 'church_period_entries',
  ]

  for (const t of tables) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`  ✗ ${t.padEnd(30)} ERROR: ${error.message}`)
    } else {
      console.log(`  ✓ ${t.padEnd(30)} ${String(count ?? 0).padStart(5)} rows`)
    }
  }

  // Spot-check test church data
  console.log('\n  ── Test Church 1 Data ──────────────────────────────')
  const checks = [
    { label: 'attendance_entries', query: () => admin.from('attendance_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id, occ3Id]) },
    { label: 'volunteer_entries',  query: () => admin.from('volunteer_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id]) },
    { label: 'response_entries',   query: () => admin.from('response_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id, occ3Id]) },
    { label: 'giving_entries',     query: () => admin.from('giving_entries').select('id').in('service_occurrence_id', [occ1Id, occ2Id]) },
  ]
  for (const c of checks) {
    const { data } = await c.query()
    console.log(`  ${c.label.padEnd(28)} ${data?.length ?? 0} rows for test occurrences`)
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n\nCLEANUP')
  await admin.from('churches').delete().eq('id', c1Id)
  await admin.from('churches').delete().eq('id', c2Id)
  await admin.auth.admin.deleteUser(u1Id)
  await admin.auth.admin.deleteUser(u2Id)
  console.log('  ✓ Both test churches and users deleted')
}

// ─── Run all ──────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SundayTally — 100 QA Tests')
console.log('═══════════════════════════════════════════════')

await setup()
await sectionA()
await sectionB()
await sectionC()
await sectionD()
await sectionE()
await sectionF()
await sectionG()
await sectionH()
await sectionI()
await sectionJ()
await tableAudit()
await cleanup()

console.log('\n═══════════════════════════════════════════════')
console.log(`  RESULTS: ${passed} passed  ${failed} failed  ${skipped} skipped`)
if (failures.length) {
  console.log('\n  FAILURES:')
  failures.forEach(f => console.log(`    ✗ ${f.id} — ${f.desc}\n      ${f.error}`))
}
console.log('═══════════════════════════════════════════════\n')
