/**
 * test-harbor-direct.mjs
 *
 * Calls Anthropic directly (no Next.js server) to test Stage A pattern
 * recognition on a fresh church with non-standard naming conventions.
 *
 * Two tests in one run:
 *   Test 1 — Harbor Community Church (wide format, AM/PM services, KidZone branding)
 *   Test 2 — Riverside Church (tall format, one row per metric)
 *
 * Evaluates:
 *   - Service code recognition from non-standard codes (AM/PM)
 *   - Volunteer audience routing when role names have no MAIN/KIDS tokens
 *   - Tall vs wide format detection
 *   - Giving source naming (Plate/eGiving, not Tithe/Offering)
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
const ANTHROPIC_KEY = env['ANTHROPIC_API_KEY']
if (!ANTHROPIC_KEY) { console.error('No ANTHROPIC_API_KEY in .env.local'); process.exit(1) }

// ── Minimal system prompt (core mapping rules only) ───────────────────────────
// Reproduce the key routing logic from stageA.ts for standalone testing

const SYSTEM = `You are a church data mapping assistant. Analyze the CSV and describe:
1. Format: is this WIDE format (one row per service occurrence) or TALL format (one row per metric)?
2. Services: what distinct service codes/names appear, and what are they likely called?
3. Columns: for each non-date column, what does it map to?
   - attendance.main  — adult/general headcount per service
   - attendance.kids  — children headcount per service
   - attendance.youth — youth/student headcount per service
   - volunteer.<ROLE> — volunteer count per service
   - giving.<SOURCE>  — per-service giving amount
   - period_giving.<SOURCE> — church-wide weekly giving (no service link)
   - response.<STAT>  — response/stat per service
   - service_date     — the date column
   - service_template_code — the service type column
   - ignore           — skip this column
4. Volunteer audiences: if there are volunteer columns, which audience do they serve?
   - MAIN (general/adult service volunteers)
   - KIDS (children's ministry volunteers)
   - YOUTH (youth/student ministry volunteers)
   Special challenge: "KidZone Helpers" has no standard token — use context from the data to determine audience.
5. Giving scope: is giving per-service or a weekly church total?
6. Any ambiguities that would need user clarification.

For TALL format, also identify:
   - The metric name column (what column holds the metric label)
   - The value column (what column holds the number)
   - The audience/grouping column if present
   - How metric names map to dest_fields

Be specific and cite actual column names and sample values.`

// ── Test 1: Wide Format — Harbor Community Church ─────────────────────────────

const HARBOR_CSV = `Date,Service,Adult Attenders,KidZone Attenders,Greeters,Parking Crew,Worship Team,KidZone Helpers,Plate,eGiving
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
2025-03-02,AM,319,88,8,6,14,10,3050.00,4220.75
2025-03-02,PM,206,59,5,4,14,7,1620.00,2950.00
2025-04-06,AM,389,112,10,9,16,14,4120.00,5840.75
2025-04-06,PM,274,84,7,6,16,11,2980.00,4210.00`

const HARBOR_FREETEXT = `Harbor Community Church has two Sunday morning services: AM (9am) and PM (11am).
Kids ministry is branded "KidZone" — it runs alongside both services.
No youth ministry. Plate and eGiving are their two giving sources.
KidZone Helpers are the volunteers who serve in the kids ministry.`

// ── Test 2: Tall Format — Riverside Church ────────────────────────────────────
// One row per metric per service per date — very different structure

const RIVERSIDE_CSV = `Week Date,Service,Category,Value
2025-01-05,Main Service,Adults,412
2025-01-05,Main Service,Children,134
2025-01-05,Main Service,First Time Guests,18
2025-01-05,Main Service,Greeters,11
2025-01-05,Main Service,Parking Volunteers,7
2025-01-05,Main Service,Tithe,8240.00
2025-01-05,Main Service,Offering,1820.50
2025-01-05,Kids Church,Children,134
2025-01-05,Kids Church,Volunteers,22
2025-01-12,Main Service,Adults,398
2025-01-12,Main Service,Children,121
2025-01-12,Main Service,First Time Guests,14
2025-01-12,Main Service,Greeters,10
2025-01-12,Main Service,Parking Volunteers,6
2025-01-12,Main Service,Tithe,7980.00
2025-01-12,Main Service,Offering,1640.25
2025-01-12,Kids Church,Children,121
2025-01-12,Kids Church,Volunteers,19
2025-01-19,Main Service,Adults,421
2025-01-19,Main Service,Children,138
2025-01-19,Main Service,First Time Guests,21
2025-01-19,Main Service,Greeters,12
2025-01-19,Main Service,Parking Volunteers,8
2025-01-19,Main Service,Tithe,8450.00
2025-01-19,Main Service,Offering,1890.75
2025-01-19,Kids Church,Children,138
2025-01-19,Kids Church,Volunteers,24
2025-02-02,Main Service,Adults,405
2025-02-02,Main Service,Children,129
2025-02-02,Main Service,First Time Guests,16
2025-02-02,Main Service,Greeters,11
2025-02-02,Main Service,Parking Volunteers,7
2025-02-02,Main Service,Tithe,8100.00
2025-02-02,Main Service,Offering,1710.50
2025-02-02,Kids Church,Children,129
2025-02-02,Kids Church,Volunteers,21
2025-02-09,Main Service,Adults,418
2025-02-09,Main Service,Children,142
2025-02-09,Main Service,First Time Guests,19
2025-02-09,Main Service,Greeters,11
2025-02-09,Main Service,Parking Volunteers,7
2025-02-09,Main Service,Tithe,8320.00
2025-02-09,Main Service,Offering,1780.00
2025-02-09,Kids Church,Children,142
2025-02-09,Kids Church,Volunteers,23
2025-03-09,Main Service,Adults,425
2025-03-09,Main Service,Children,136
2025-03-09,Main Service,First Time Guests,20
2025-03-09,Main Service,Greeters,12
2025-03-09,Main Service,Parking Volunteers,8
2025-03-09,Main Service,Tithe,8500.00
2025-03-09,Main Service,Offering,1850.25
2025-03-09,Kids Church,Children,136
2025-03-09,Kids Church,Volunteers,22`

const RIVERSIDE_FREETEXT = `Riverside Church has one main Sunday service and a concurrent kids church called "Kids Church".
Data is recorded per metric per service. "Children" appears in both Main Service and Kids Church rows for the same date —
in the main service row it's kids attending the main auditorium; in the Kids Church row it's kids in the dedicated kids space.
Tithe and Offering are per-service giving. First Time Guests is tracked per main service only.`

// ── Run a test ────────────────────────────────────────────────────────────────

async function runTest(testName, csv, freeText) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`TEST: ${testName}`)
  console.log('═'.repeat(60))

  const userPrompt = `CSV data:\n\`\`\`csv\n${csv}\n\`\`\`\n\nChurch description: ${freeText}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-5',
      max_tokens: 2000,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`API error: ${res.status} ${err}`)
    return
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? '(no response)'
  console.log(text)
  console.log(`\nTokens: ${data.usage?.input_tokens} in / ${data.usage?.output_tokens} out`)
}

// ── Run both tests ────────────────────────────────────────────────────────────

console.log('\n SundayTally — Stage A Pattern Recognition Tests')
console.log(' Testing WITHOUT Next.js server (direct Anthropic call)\n')

await runTest('Harbor Community — Wide Format (AM/PM, KidZone branding)', HARBOR_CSV, HARBOR_FREETEXT)
await runTest('Riverside Church — Tall Format (one row per metric)', RIVERSIDE_CSV, RIVERSIDE_FREETEXT)

console.log('\n\nDone.')
