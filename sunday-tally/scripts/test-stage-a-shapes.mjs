/**
 * test-stage-a-shapes.mjs
 *
 * Throws a variety of synthetic church-data shapes at the Stage A pipeline
 * and reports what it proposes. Goal: find systemic robustness issues across
 * different church patterns, not just the Demo Church shape.
 *
 * No Stage B writes — we capture proposed_mapping per shape and audit it.
 */
import { readFileSync } from 'fs'
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

// ── Sign in once ─────────────────────────────────────────────────────────────
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

// ── CSV generators ────────────────────────────────────────────────────────────
function* sundays(start, count) {
  const d = new Date(start)
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  for (let i = 0; i < count; i++) {
    yield d.toISOString().slice(0, 10)
    d.setDate(d.getDate() + 7)
  }
}

const seed = (i, base, jitter) => Math.round(base + (Math.sin(i * 1.3) * jitter))

// ── Test shapes ───────────────────────────────────────────────────────────────

function shapeMinimal() {
  // Smallest realistic CSV: one service, basic adults+kids+offering. Common pattern for small churches.
  let csv = 'Date,Adults,Kids,Offering\n'
  let i = 0
  for (const d of sundays('2024-04-07', 24)) {
    csv += `${d},${seed(i, 150, 25)},${seed(i, 40, 8)},${seed(i, 2500, 400)}\n`
    i++
  }
  return { name: 'minimal', value: csv, kind: 'csv' }
}

function shapeWideMultiService() {
  // Wide format with two parallel services, no audience split per service in headers
  let csv = 'Date,Service,Attendance,Giving\n'
  let i = 0
  for (const d of sundays('2024-04-07', 24)) {
    csv += `${d},9am,${seed(i, 80, 15)},${seed(i, 1500, 200)}\n`
    csv += `${d},11am,${seed(i, 100, 20)},${seed(i, 2000, 300)}\n`
    i++
  }
  return { name: 'wide-two-services', value: csv, kind: 'csv' }
}

function shapeWeirdAudience() {
  // Tall format with non-standard audience labels — tests AI's audience_map inference
  let csv = 'Date,Group,Count\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    csv += `${d},Members,${seed(i, 120, 20)}\n`
    csv += `${d},Kiddos,${seed(i, 35, 6)}\n`
    csv += `${d},Teens,${seed(i, 25, 5)}\n`
    i++
  }
  return { name: 'weird-audience', value: csv, kind: 'csv' }
}

function shapeNoServiceColumn() {
  // No service_type column, no audience split, just totals — trivial church format
  let csv = 'Sunday,Total Attendance,Total Giving\n'
  let i = 0
  for (const d of sundays('2024-04-07', 16)) {
    csv += `${d},${seed(i, 200, 30)},${seed(i, 4000, 500)}\n`
    i++
  }
  return { name: 'totals-only', value: csv, kind: 'csv' }
}

function shapeMonthlyOnly() {
  // Monthly aggregates only — should hit Rule 1 (low confidence) AND month-scope stats
  let csv = 'Month,New Members,Baptisms\n'
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    csv += `2024-${mm}-01,${3 + (m % 4)},${1 + (m % 3)}\n`
  }
  return { name: 'monthly-only', value: csv, kind: 'csv' }
}

const tests = [
  shapeMinimal(),
  shapeWideMultiService(),
  shapeWeirdAudience(),
  shapeNoServiceColumn(),
  shapeMonthlyOnly(),
]

// ── Run each through Stage A ─────────────────────────────────────────────────
console.log(`\n══ Running Stage A against ${tests.length} synthetic shapes ══\n`)

const results = []
for (const t of tests) {
  console.log(`\n── ${t.name} ──`)
  console.log(`  csv preview: ${t.value.slice(0, 90).replace(/\n/g, ' | ')}...`)
  const t0 = Date.now()
  const res = await fetch(`${APP_URL}/api/onboarding/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
    body: JSON.stringify({ sources: [t], freeText: '' }),
  })
  const elapsed = Math.round((Date.now() - t0) / 1000)
  const body = await res.json()
  if (!res.ok) {
    console.log(`  ✗ FAILED (${res.status}, ${elapsed}s):`, body.error, body.detail ?? '')
    results.push({ name: t.name, ok: false, error: body.error, detail: body.detail })
    continue
  }
  const m = body.proposed_mapping
  const summary = {
    name: t.name,
    elapsed_s: elapsed,
    confidence: m?.confidence,
    weeks_observed: m?.weeks_observed,
    sources_count: m?.sources?.length ?? 0,
    templates: (m?.proposed_setup?.service_templates ?? []).map(s => ({
      name: s.display_name,
      code: s.service_code,
      tag: s.primary_tag,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
    })),
    response_categories: (m?.proposed_setup?.response_categories ?? []).map(r => `${r.name} (${r.stat_scope})`),
    giving_sources: (m?.proposed_setup?.giving_sources ?? []).map(g => g.name),
    volunteer_categories: (m?.proposed_setup?.volunteer_categories ?? []).map(v => `${v.name} (${v.audience_type ?? '—'})`),
    questions: (m?.clarification_questions ?? []).map(q => `[${q.blocking ? 'BLOCK' : 'opt'}] ${q.id}: ${q.title}`),
    dest_fields_in_use: (() => {
      const set = new Set()
      for (const src of m?.sources ?? []) {
        for (const c of src.column_map ?? []) set.add(c.dest_field)
        if (src.tall_format?.area_field_map) {
          for (const v of Object.values(src.tall_format.area_field_map)) set.add(v)
        }
      }
      return [...set].sort()
    })(),
  }
  results.push({ ok: true, ...summary })
  console.log(`  ✓ Stage A complete (${elapsed}s, ${m?.weeks_observed} weeks, confidence=${m?.confidence})`)
  console.log(`    Templates: ${summary.templates.map(t => `${t.name}/${t.tag}/dow=${t.day_of_week}`).join(', ') || '(none)'}`)
  console.log(`    Questions: ${summary.questions.join(' | ') || '(none)'}`)
}

// ── Final report ─────────────────────────────────────────────────────────────
console.log(`\n\n═══ FULL REPORT ═══\n`)
console.log(JSON.stringify(results, null, 2))
