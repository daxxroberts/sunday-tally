/**
 * Round 2 — refine/reclarify branch test.
 * Uses deliberately ambiguous answers (M2 audience choice + contradicting service times)
 * to push Sonnet off the default 'proceed' path.
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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY     = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP_URL      = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

const jobId = process.argv[2]
if (!jobId) { console.error('Usage: node scripts/test-round2-refine.mjs <job_id>'); process.exit(1) }

const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
  body: JSON.stringify({ email: 'demo@sundaytally.dev', password: 'SundayTally123!' }),
}).then(r => r.json())
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1]
const cookieHeader = `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify(signIn))}`

// Deliberately ambiguous answers designed to push Sonnet off "proceed":
//  • Audience structure → M2 ("fully separate services") — triggers _needs_review
//  • Service names blank-ish (forces decision to clarify what to do with codes)
//  • Contradictory: confirms 3 services but says giving is per-service (would need split)
const sampleAnswers = [
  {
    id: 'q_pattern_audience_structure',
    question: 'How are your audiences structured?',
    answer: 'They\'re kind of separate, kind of not — some Sundays we combine, others we split',
    accepted: true,
    selected_option_index: 1,
    meaning_code: 'M2',
  },
  {
    id: 'q_pattern_service_count',
    question: 'Confirm your services',
    answer: 'Maybe? I think we have 3 but we might be merging some',
    accepted: true,
    selected_option_index: 0,
  },
  {
    id: 'q_giving_period_confirm',
    question: 'Giving period',
    answer: 'Actually we sometimes track per-service giving too, just not always',
    accepted: true,
  },
  {
    id: 'q_service_times',
    question: 'Service times',
    answer: 'Times vary',
    accepted: true,
  },
]

console.log('Calling /api/onboarding/import/refine with AMBIGUOUS answers...')
const t0 = Date.now()
const res = await fetch(`${APP_URL}/api/onboarding/import/refine`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
  body: JSON.stringify({ job_id: jobId, qa_answers: sampleAnswers }),
})
const elapsed = Math.round((Date.now() - t0) / 1000)
const data = await res.json()
console.log(`Response in ${elapsed}s — decision = ${data.decision ?? 'ERROR'}`)
console.log(JSON.stringify(data, null, 2))
