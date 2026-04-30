/**
 * Programmatic test of the Round 2 (refine) endpoint.
 * Simulates user answers and inspects Sonnet's decision: proceed / refine / reclarify.
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

const jobId = process.argv[2]
if (!jobId) { console.error('Usage: node scripts/test-round2.mjs <job_id>'); process.exit(1) }

// Sign in
const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body: JSON.stringify({ email: 'demo@sundaytally.dev', password: 'SundayTally123!' }),
}).then(r => r.json())
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1]
const cookieHeader = `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify(signIn))}`

// Build sample answers — assuming Q-PAT-2 + others; pick reasonable answers
const sampleAnswers = [
  { id: 'q_pattern_service_count', question: 'Q', answer: 'Yes — these match', accepted: true, selected_option_index: 0 },
  { id: 'q_exp1_exp2_service_codes', question: 'Q', answer: '1 = Experience 1, 2 = Experience 2', accepted: true },
  { id: 'q_giving_period_confirm', question: 'Q', answer: 'One total per week', accepted: true, selected_option_index: 0 },
  { id: 'q_service_times', question: 'Q', answer: 'Experience 1: 09:00\nExperience 2: 11:00\nSwitch: 18:30', accepted: true },
]

console.log('Calling /api/onboarding/import/refine with sample answers...')
const t0 = Date.now()
const res = await fetch(`${APP_URL}/api/onboarding/import/refine`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
  body: JSON.stringify({ job_id: jobId, qa_answers: sampleAnswers }),
})
const elapsed = Math.round((Date.now() - t0) / 1000)
const data = await res.json()
console.log(`Response in ${elapsed}s:`)
console.log(JSON.stringify(data, null, 2))
