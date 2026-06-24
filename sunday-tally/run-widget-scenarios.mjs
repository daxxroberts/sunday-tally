/**
 * run-widget-scenarios.mjs
 *
 * Calls the test harness endpoint and prints a clean scorecard.
 * Run AFTER starting the dev server: npx next dev
 *
 *   node run-widget-scenarios.mjs
 *   node run-widget-scenarios.mjs --ids 1,2,3    # run specific scenarios only
 *   node run-widget-scenarios.mjs --category giving
 */

const BASE = 'http://localhost:3000'
const SECRET = 'sunday-tally-test-2026'
const BATCH_SIZE = 8  // ~8 scenarios per request keeps well under the 5-min timeout

// Parse CLI args
const args = process.argv.slice(2)
const idsArg = args.find(a => a.startsWith('--ids='))?.split('=')[1]
const catArg = args.find(a => a.startsWith('--category='))?.split('=')[1]
const ids = idsArg ? idsArg.split(',').map(Number) : null

const ALL_IDS = Array.from({ length: 50 }, (_, i) => i + 1)
const targetIds = ids ?? ALL_IDS

console.log('\n🧪  Sunday Tally — AI Widget Builder Stress Test')
console.log('─'.repeat(72))

if (ids) console.log(`   Running scenarios: ${ids.join(', ')}`)
else if (catArg) console.log(`   Filtering by category: ${catArg}`)
else console.log(`   Running all ${targetIds.length} scenarios in batches of ${BATCH_SIZE}`)
console.log('')

// Chunk ids into batches
const batches = []
for (let i = 0; i < targetIds.length; i += BATCH_SIZE) {
  batches.push(targetIds.slice(i, i + BATCH_SIZE))
}

const allResults = []
const allIssues = []

async function runBatch(batch, attempt = 1) {
  try {
    const res = await fetch(`${BASE}/api/test/widget-scenarios`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-test-secret': SECRET,
      },
      body: JSON.stringify({ scenario_ids: batch }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    return await res.json()
  } catch (err) {
    if (attempt < 3) {
      process.stdout.write(` (retry ${attempt} after ${err.message?.slice(0, 40) ?? err})…`)
      await new Promise(r => setTimeout(r, 3000))
      return runBatch(batch, attempt + 1)
    }
    throw err
  }
}

for (let b = 0; b < batches.length; b++) {
  const batch = batches[b]
  process.stdout.write(`   Batch ${b + 1}/${batches.length} (scenarios ${batch[0]}–${batch[batch.length - 1]})…`)

  let data
  try {
    data = await runBatch(batch)
  } catch (err) {
    console.error(`\nBatch ${b + 1} failed after retries: ${err.message ?? err}`)
    process.exit(1)
  }

  allResults.push(...data.results)
  allIssues.push(...data.issues)
  console.log(` done (${data.results.length} results)`)
}

// ─── Filter by category if requested ─────────────────────────────────────────
let results = allResults
if (catArg) results = results.filter(r => r.category === catArg)

// ─── Print per-scenario rows ──────────────────────────────────────────────────
const VERDICT_ICONS = {
  PASS:        '✅',
  PASS_WARN:   '⚠️ ',
  ZERO_ROWS:   '🔴',
  SPEC_ERROR:  '❌',
  NO_BUILD:    '⬛',
  CAPABILITY:  '🔵',
  AI_ERROR:    '💥',
}

for (const r of results) {
  const icon  = VERDICT_ICONS[r.verdict] ?? '❓'
  const rows  = r.row_count !== null ? `${r.row_count} rows` : '—'
  const viz   = r.viz_kind ?? '—'
  const win   = r.window_type ?? '—'
  const src   = (r.source ?? '—').replace('_per_occurrence', '').replace('metric_entries_readable', 'firehose').replace('giving_per_week', 'giving')
  console.log(`${icon} [${String(r.id).padStart(2, '0')}] ${r.prompt.slice(0, 60).padEnd(60)} | ${viz.padEnd(12)} | ${src.padEnd(10)} | ${win.padEnd(10)} | ${rows}`)
  for (const issue of r.issues) {
    console.log(`       ⚠  ${issue.code}: ${issue.detail}`)
  }
  if (r.build_error) {
    console.log(`       ✗  ${r.build_error}`)
  }
  if ((r.verdict === 'NO_BUILD' || r.verdict === 'CAPABILITY') && r.final_answer) {
    console.log(`       →  "${r.final_answer.slice(0, 120)}"`)
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(72))
console.log('SUMMARY')
console.log('─'.repeat(72))

const total = results.length
const s = results.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] ?? 0) + 1; return acc }, {})
console.log(`  Total:       ${total}`)
console.log(`  ✅ PASS:     ${s.PASS ?? 0}  (${pct(s.PASS, total)}%)`)
console.log(`  ⚠️  PASS_WARN: ${s.PASS_WARN ?? 0}  (${pct(s.PASS_WARN, total)}%)`)
console.log(`  🔴 ZERO_ROWS: ${s.ZERO_ROWS ?? 0}  (${pct(s.ZERO_ROWS, total)}%)`)
console.log(`  ❌ SPEC_ERROR: ${s.SPEC_ERROR ?? 0}  (${pct(s.SPEC_ERROR, total)}%)`)
console.log(`  ⬛ NO_BUILD:  ${s.NO_BUILD ?? 0}  (${pct(s.NO_BUILD, total)}%)`)
console.log(`  🔵 CAPABILITY: ${s.CAPABILITY ?? 0}  (${pct(s.CAPABILITY, total)}%)`)
console.log(`  💥 AI_ERROR:  ${s.AI_ERROR ?? 0}`)

// Issue frequency
if (allIssues.length > 0) {
  console.log('\nISSUES:')
  const freq = {}
  for (const i of allIssues) freq[i.code] = (freq[i.code] ?? 0) + 1
  for (const [code, count] of Object.entries(freq).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code}: ${count}x`)
  }
}

console.log('')

function pct(n, total) {
  if (!n || !total) return '0'
  return Math.round((n / total) * 100)
}
