/**
 * confirm-harbor.mjs
 * Programmatically confirms the Harbor import job (Stage B).
 * Run: node scripts/confirm-harbor.mjs <job_id>
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const ANON_KEY     = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const APP_URL      = env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
const EMAIL        = 'demo@sundaytally.dev'
const PASSWORD     = 'SundayTally123!'

const jobId = process.argv[2]
if (!jobId) { console.error('Usage: node confirm-harbor.mjs <job_id>'); process.exit(1) }

// ── Sign in ───────────────────────────────────────────────────────────────────
console.log(`\n[1/3] Signing in as ${EMAIL}...`)
const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body:    JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
const auth = await signIn.json()
if (!auth.access_token) { console.error('Auth failed:', JSON.stringify(auth)); process.exit(1) }
console.log('✓ Signed in')

const cookieVal = JSON.stringify({
  access_token:  auth.access_token,
  refresh_token: auth.refresh_token,
  token_type:    'bearer',
  expires_in:    3600,
  expires_at:    Math.floor(Date.now() / 1000) + 3600,
  user:          auth.user,
})
const cookieName = `sb-${SUPABASE_URL.match(/\/\/([^.]+)/)[1]}-auth-token`
const headers = {
  'Content-Type': 'application/json',
  'Cookie': `${cookieName}=${cookieVal}`,
}

// ── Fetch the proposed mapping ────────────────────────────────────────────────
console.log(`\n[2/3] Fetching proposed mapping for job ${jobId}...`)
const pollRes = await fetch(`${APP_URL}/api/onboarding/import?job_id=${jobId}`, { headers })
if (!pollRes.ok) {
  const t = await pollRes.text()
  console.error(`Poll failed ${pollRes.status}:`, t)
  process.exit(1)
}
const pollData = await pollRes.json()
const job = pollData.job
console.log(`  Status: ${job?.status}`)
if (!job?.proposed_mapping) { console.error('No proposed_mapping on job'); process.exit(1) }

// ── Confirm (POST to trigger Stage B) ────────────────────────────────────────
console.log(`\n[3/3] Confirming import (Stage B)...`)
const confirmRes = await fetch(`${APP_URL}/api/onboarding/import`, {
  method:  'PATCH',
  headers,
  body: JSON.stringify({
    job_id:            jobId,
    confirmed_mapping: {
      sources:        job.proposed_mapping.sources,
      proposed_setup: job.proposed_mapping.proposed_setup,
      qa_answers:     [],
    },
  }),
})

if (!confirmRes.ok) {
  const t = await confirmRes.text()
  console.error(`Confirm failed ${confirmRes.status}:`, t)
  process.exit(1)
}

const result = await confirmRes.json()
console.log('\n── Stage B Results ───────────────────────────────────────────\n')
const r = result.result?.rowsInserted ?? result.rowsInserted ?? {}
console.log(`Occurrences:   ${r.occurrences ?? '?'}`)
console.log(`Attendance:    ${r.attendance ?? '?'}`)
console.log(`Volunteers:    ${r.volunteer ?? '?'}`)
console.log(`Giving:        ${r.giving ?? '?'}`)
console.log(`Period giving: ${r.period_giving ?? '?'}`)
console.log(`Response:      ${r.response ?? '?'}`)
const errors = result.result?.errors ?? result.errors ?? []
if (errors.length > 0) {
  console.log(`\nErrors (${errors.length}):`)
  for (const e of errors) console.log(`  ✗ ${e}`)
} else {
  console.log('\n✓ No errors')
}
console.log('\nFull result:', JSON.stringify(result, null, 2))
