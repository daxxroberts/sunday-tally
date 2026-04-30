/**
 * start-import.mjs
 *
 * Signs in as the demo account, calls the import API with the Google Sheet URL,
 * and prints the Stage A proposed mapping (questions) so the user can take over.
 *
 * Usage: node scripts/start-import.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env.local ──────────────────────────────────────────────────────────

const envPath = resolve(__dirname, '../.env.local')
const envRaw  = readFileSync(envPath, 'utf8')
const env     = Object.fromEntries(
  envRaw
    .split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => {
      const eq = l.indexOf('=')
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]
    })
)

const SUPABASE_URL  = env['NEXT_PUBLIC_SUPABASE_URL']   // https://iwbrzdiubrvogiamoqvx.supabase.co
const ANON_KEY      = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const APP_URL       = env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

const DEMO_EMAIL    = 'demo@sundaytally.dev'
const DEMO_PASSWORD = 'SundayTally123!'

// Demo Church workbook — three tabs share the same spreadsheet ID, different gids.
const WORKBOOK_ID = '1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04'
const SHEETS = [
  { name: 'Sunday Main Services',  gid: '1378199377' },  // Experience 1 + 2
  { name: 'Switch (Youth)',         gid: '282060338'  },  // Wed night youth — branded "Switch"
  { name: 'Weekly Giving',          gid: '181499763'  },  // church-wide weekly totals
]
const FREE_TEXT = `Demo Church has two Sunday morning services called Experience 1 and Experience 2, both meeting on Sundays.
There is a Wednesday-night youth ministry the church calls "Switch" — adult leaders run it for the youth audience.
Weekly giving is recorded as a single church-wide total per week (not split per service).`

// ── Step 1: Sign in via Supabase auth REST ────────────────────────────────────

console.log('\n── SundayTally Import Kickoff ───────────────────────────')
console.log(`\n[1/3] Signing in as ${DEMO_EMAIL}...`)

const signInRes = await fetch(
  `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  }
)

if (!signInRes.ok) {
  const err = await signInRes.text()
  console.error('  ✗ Sign-in failed:', err)
  process.exit(1)
}

const session = await signInRes.json()
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1]

if (!projectRef) {
  console.error('  ✗ Could not extract project ref from SUPABASE_URL')
  process.exit(1)
}

console.log(`  ✓ Signed in (project: ${projectRef})`)

// ── Build the Supabase SSR session cookie ─────────────────────────────────────
// @supabase/ssr v0.6: stores session as plain JSON string in one cookie chunk
// (createChunks only base64s when the value exceeds the chunk size limit ~3800 bytes)
// Cookie name: sb-{projectRef}-auth-token

const cookieName  = `sb-${projectRef}-auth-token`
const sessionJson = JSON.stringify({
  access_token:  session.access_token,
  refresh_token: session.refresh_token,
  expires_at:    session.expires_at,
  expires_in:    session.expires_in,
  token_type:    session.token_type,
  user:          session.user,
})

// URL-encode the JSON value so it's safe in a Cookie header
const cookieValue = encodeURIComponent(sessionJson)
const cookieHeader = `${cookieName}=${cookieValue}`

// ── Step 2: Call import API ───────────────────────────────────────────────────

console.log('\n[2/3] Starting AI import with three Google Sheets tabs...')
SHEETS.forEach(s => console.log(`  • ${s.name} (gid ${s.gid})`))
console.log(`\n  Description passed to Stage A:\n${FREE_TEXT.split('\n').map(l => '    ' + l).join('\n')}\n`)
console.log('  Running Opus (pattern read) + Sonnet (mapping) + Haiku (humanize)...\n')

const sources = SHEETS.map(s => ({
  kind:  'sheet_url',
  name:  s.name,
  value: `https://docs.google.com/spreadsheets/d/${WORKBOOK_ID}/edit?gid=${s.gid}#gid=${s.gid}`,
}))

const importRes = await fetch(`${APP_URL}/api/onboarding/import`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': cookieHeader,
  },
  body: JSON.stringify({
    sources,
    freeText: FREE_TEXT,
  }),
})

if (!importRes.ok) {
  const body = await importRes.json().catch(() => ({}))
  console.error(`  ✗ Import API returned ${importRes.status}:`, JSON.stringify(body, null, 2))
  process.exit(1)
}

const importBody = await importRes.json()

console.log(`\n  ✓ Stage A complete (job_id: ${importBody.job_id})`)

// ── Step 3: Print questions ───────────────────────────────────────────────────

console.log('\n[3/3] Proposed mapping questions:\n')

const mapping = importBody.proposed_mapping
const questions = mapping?.clarification_questions ?? []

if (questions.length === 0) {
  console.log('  No questions — mapping is unambiguous.')
} else {
  questions.forEach((q, i) => {
    const flag = q.blocking ? '[BLOCKING]' : '[optional]'
    console.log(`  Q${i + 1} ${flag} — ${q.title}`)
    console.log(`    ${q.question}`)
    if (q.options) {
      q.options.forEach(o => console.log(`      • ${o.label}: ${o.explanation}`))
    }
    console.log()
  })
}

const templates = mapping?.proposed_setup?.service_templates ?? []
console.log('Proposed services:')
templates.forEach(t => console.log(`  • ${t.display_name} (${t.primary_tag}) — ${t.primary_tag_reasoning}`))

const givingSources = mapping?.proposed_setup?.giving_sources ?? []
console.log('\nProposed giving sources:')
givingSources.forEach(s => console.log(`  • ${s.name}`))

const volCats = mapping?.proposed_setup?.volunteer_categories ?? []
console.log('\nProposed volunteer categories:')
volCats.forEach(v => console.log(`  • ${v.name} (${v.audience_type ?? 'all'})`))

const respCats = mapping?.proposed_setup?.response_categories ?? []
console.log('\nProposed stat categories:')
respCats.forEach(r => console.log(`  • ${r.name} (scope: ${r.stat_scope})`))

// ── Hand-off ──────────────────────────────────────────────────────────────────

console.log(`
────────────────────────────────────────────────────
  ✓ Stage A complete.

  To review + confirm in the browser:
  http://localhost:3000/onboarding/import/confirm?job_id=${importBody.job_id}

  Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}
────────────────────────────────────────────────────
`)
