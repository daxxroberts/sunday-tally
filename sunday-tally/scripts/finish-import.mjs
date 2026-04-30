/**
 * finish-import.mjs
 *
 * Picks up the latest awaiting_confirmation import job for the demo user,
 * builds a confirmed_mapping with realistic qa_answers (service names + times),
 * PATCHes the import API to trigger Stage B, and polls until done.
 *
 * Then prints rowsInserted counts and any errors for inspection.
 *
 * Usage: node scripts/finish-import.mjs
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

const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY      = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY   = env.SUPABASE_SERVICE_ROLE_KEY
const APP_URL       = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const DEMO_EMAIL    = 'demo@sundaytally.dev'
const DEMO_PASSWORD = 'SundayTally123!'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log('\n── SundayTally Import Finisher ────────────────────────')

// Resolve church
const { data: list } = await admin.auth.admin.listUsers()
const user = list?.users?.find(u => u.email === DEMO_EMAIL)
if (!user) { console.error('Demo user not found.'); process.exit(1) }
const { data: m } = await admin
  .from('church_memberships')
  .select('church_id')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .maybeSingle()
const churchId = m.church_id

// Find latest awaiting_confirmation job for this church
const { data: jobs } = await admin
  .from('import_jobs')
  .select('id, proposed_mapping, status, created_at')
  .eq('church_id', churchId)
  .eq('status', 'awaiting_confirmation')
  .order('created_at', { ascending: false })
  .limit(1)
const job = jobs?.[0]
if (!job) { console.error('No awaiting_confirmation job. Run start-import.mjs first.'); process.exit(1) }

console.log(`Using job: ${job.id}\n`)

const proposed = job.proposed_mapping
const templates = proposed.proposed_setup?.service_templates ?? []
const questions = proposed.clarification_questions ?? []

// Build qa_answers — simulate the user filling them in.
// Realistic: Experience 1 at 9am, Experience 2 at 11am, Switch at 6:30pm.
const qaAnswers = []
for (const q of questions) {
  if (q.id === 'q_service_names') {
    // 2 unnamed services — both Sundays. Map by service_code.
    qaAnswers.push({
      question: q.question,
      answer:   'Code 1 = Experience 1\nCode 2 = Experience 2',
      accepted: true,
    })
  } else if (q.id === 'q_service_times') {
    // Provide times for every template that needs one.
    // Match by display_name when available, fall back to service_code.
    const lines = []
    for (const t of templates) {
      const name = (t.display_name && !t.display_name.includes('[BLOCKING]'))
        ? t.display_name
        : (t.service_code === '1' ? 'Experience 1'
           : t.service_code === '2' ? 'Experience 2'
           : t.service_code)
      const time = name.toLowerCase().includes('switch') ? '18:30'
                 : name.toLowerCase().includes('experience 2') ? '11:00'
                 : '09:00'
      lines.push(`${name}: ${time}`)
    }
    qaAnswers.push({
      question: q.question,
      answer:   lines.join('\n'),
      accepted: true,
    })
  } else {
    // Unknown question — accept default empty answer
    qaAnswers.push({
      question: q.question,
      answer:   '',
      accepted: false,
    })
  }
}

console.log('Simulated qa_answers:')
qaAnswers.forEach(a => console.log(`  Q: ${a.question.split('\n')[0]}\n  A: ${a.answer.replace(/\n/g, ' | ')}\n`))

// Sign in to get session cookie
const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
})
const session = await signInRes.json()
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1]
const cookieName = `sb-${projectRef}-auth-token`
const sessionJson = JSON.stringify({
  access_token:  session.access_token,
  refresh_token: session.refresh_token,
  expires_at:    session.expires_at,
  expires_in:    session.expires_in,
  token_type:    session.token_type,
  user:          session.user,
})
const cookieHeader = `${cookieName}=${encodeURIComponent(sessionJson)}`

// Build confirmed_mapping. Keep proposed sources as-is (their shape matches ConfirmedSourceMapping).
const confirmed = {
  sources:        proposed.sources,
  proposed_setup: proposed.proposed_setup,
  qa_answers:     qaAnswers,
}

console.log('Triggering Stage B (PATCH /api/onboarding/import)...')
const patchRes = await fetch(`${APP_URL}/api/onboarding/import`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
  body: JSON.stringify({ job_id: job.id, confirmed_mapping: confirmed }),
})

if (!patchRes.ok) {
  const body = await patchRes.json().catch(() => ({}))
  console.error(`✗ Stage B failed (${patchRes.status}):`, JSON.stringify(body, null, 2))
  process.exit(1)
}

const stageBResult = await patchRes.json()

console.log('\n=== STAGE B RESULT ===\n')
console.log('Setup summary:', stageBResult.result?.setupSummary ?? '(none)')
console.log('\nRows inserted:')
const counts = stageBResult.result?.rowsInserted ?? {}
Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}`))

const errors = stageBResult.result?.errors ?? []
if (errors.length > 0) {
  console.log(`\nErrors (${errors.length}):`)
  errors.slice(0, 20).forEach(e => console.log(`  • ${e}`))
  if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`)
} else {
  console.log('\nNo errors.')
}

// Verify in DB
const { data: tmpls } = await admin.from('service_templates').select('id, display_name, service_code').eq('church_id', churchId)
const { data: svs }   = await admin.from('service_schedule_versions').select('service_template_id, day_of_week, start_time').eq('is_active', true)
const tmplMap = Object.fromEntries((tmpls ?? []).map(t => [t.id, t]))
console.log('\n=== SCHEDULE VERSIONS WRITTEN ===')
for (const sv of svs ?? []) {
  const t = tmplMap[sv.service_template_id]
  if (!t) continue
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  console.log(`  ${t.display_name.padEnd(20)} (${t.service_code})  → ${days[sv.day_of_week]} ${sv.start_time}`)
}

const { count: occCount }    = await admin.from('service_occurrences').select('id', { count: 'exact', head: true }).eq('church_id', churchId)
const { count: pgCount }     = await admin.from('church_period_giving').select('id', { count: 'exact', head: true }).eq('church_id', churchId)
const { count: peCount }     = await admin.from('church_period_entries').select('id', { count: 'exact', head: true }).eq('church_id', churchId)

console.log('\n=== DATABASE TOTALS ===')
console.log(`  service_occurrences      ${occCount}`)
console.log(`  church_period_giving     ${pgCount}`)
console.log(`  church_period_entries    ${peCount}`)

console.log(`
────────────────────────────────────────────────────
  ✓ Full pipeline test complete.

  Open in browser to verify:
  • /services         — recent services list (T1)
  • /services/history — full historical grid
  • /services/weekly  — church-wide weekly giving entries
  • /dashboard        — analytics
────────────────────────────────────────────────────
`)
