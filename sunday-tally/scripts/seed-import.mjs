/**
 * seed-import.mjs
 * Creates a test church account, submits the three demo sheets to Stage A,
 * polls until the import job has clarification questions, then prints them.
 *
 * Run: node scripts/seed-import.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const ANON_KEY         = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjc4MzAsImV4cCI6MjA5MTg0MzgzMH0.Bl_JHSp-p3qnVt2Fh1cX2zBCrdK9UHxQfdlOSgzt8ag'
const SERVICE_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'
const APP_URL          = 'http://localhost:3000'
const PROJECT_REF      = 'iwbrzdiubrvogiamoqvx'
const COOKIE_NAME      = `sb-${PROJECT_REF}-auth-token`

// Demo church test account
const TEST_EMAIL    = 'test-import@sundaytally.dev'
const TEST_PASSWORD = 'TestImport123!'
const CHURCH_NAME   = 'Demo Church'
const OWNER_NAME    = 'Test Owner'

// Three demo sheets (same workbook, different tabs)
const SOURCES = [
  { kind: 'sheet_url', name: 'Sunday Services',  value: 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?gid=1378199377#gid=1378199377' },
  { kind: 'sheet_url', name: 'Giving',            value: 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?gid=181499763#gid=181499763' },
  { kind: 'sheet_url', name: 'Switch (Wednesday)',value: 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?gid=282060338#gid=282060338' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCookieHeader(session) {
  const json   = JSON.stringify(session)
  const CHUNK  = 3600
  const chunks = []
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK))

  if (chunks.length === 1) {
    return `${COOKIE_NAME}=${encodeURIComponent(chunks[0])}`
  }
  return chunks
    .map((c, i) => `${COOKIE_NAME}.${i}=${encodeURIComponent(c)}`)
    .join('; ')
}

async function appFetch(path, opts, session) {
  return fetch(`${APP_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Cookie: buildCookieHeader(session),
      ...(opts?.headers ?? {}),
    },
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Main ──────────────────────────────────────────────────────────────────────

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anon = createClient(SUPABASE_URL, ANON_KEY)

async function provisionChurch() {
  console.log('→ Checking for existing test user…')

  // Try signing in first — avoids double-provisioning on reruns
  const { data: existing } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL, password: TEST_PASSWORD,
  })
  if (existing?.session) {
    console.log('  Already exists — using existing account.')
    // Bump budget in case previous run exhausted it
    const { data: mem } = await admin.from('church_memberships')
      .select('church_id').eq('user_id', existing.session.user.id).eq('is_active', true).maybeSingle()
    if (mem?.church_id) {
      console.log('→ Ensuring AI budget for existing church…')
      const { data: periods } = await admin.from('ai_usage_periods')
        .select('id').eq('church_id', mem.church_id).eq('period_key', 'trial')
      if (periods && periods.length > 0) {
        for (const p of periods) {
          await admin.from('ai_usage_periods').update({ cap_cents: 5000, cents_used: 0 }).eq('id', p.id)
        }
      } else {
        await admin.from('ai_usage_periods').insert({
          church_id: mem.church_id, bucket: 'setup', period_key: 'trial', cents_used: 0, cap_cents: 5000,
        })
      }
    }
    return existing.session
  }

  console.log('→ Creating auth user…')
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    user_metadata: { full_name: OWNER_NAME },
    email_confirm: true,
  })
  if (authErr) throw new Error(`Auth create failed: ${authErr.message}`)
  const userId = authData.user.id

  console.log('→ Creating church record…')
  const slug = `demo-church-${Math.random().toString(36).slice(2, 7)}`
  const { data: church, error: churchErr } = await admin
    .from('churches').insert({ name: CHURCH_NAME, slug }).select('id').single()
  if (churchErr) throw new Error(`Church insert failed: ${churchErr.message}`)
  const churchId = church.id

  console.log('→ Creating default location…')
  const { error: locErr } = await admin
    .from('church_locations')
    .insert({ church_id: churchId, name: 'Main Campus', code: 'MAIN', sort_order: 1 })
  if (locErr) throw new Error(`Location insert failed: ${locErr.message}`)

  console.log('→ Seeding defaults…')
  await Promise.all([
    admin.rpc('seed_default_stat_categories',  { p_church_id: churchId }),
    admin.rpc('seed_default_giving_sources',   { p_church_id: churchId }),
    admin.rpc('seed_default_service_tags',     { p_church_id: churchId }),
  ])

  console.log('→ Creating owner membership…')
  const { error: memErr } = await admin
    .from('church_memberships')
    .insert({ user_id: userId, church_id: churchId, role: 'owner', is_active: true })
  if (memErr) throw new Error(`Membership insert failed: ${memErr.message}`)

  console.log('→ Seeding AI budget (trial setup)…')
  await admin.from('ai_usage_periods').insert({
    church_id:  churchId,
    bucket:     'setup',
    period_key: 'trial',
    cents_used: 0,
    cap_cents:  5000,  // $50 — plenty for test imports
  })

  console.log('→ Signing in as new user…')
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL, password: TEST_PASSWORD,
  })
  if (signInErr || !signIn.session) throw new Error(`Sign-in failed: ${signInErr?.message}`)
  return signIn.session
}

async function submitImport(session) {
  console.log('\n→ Submitting import job (Stage A) — this takes 30–90 seconds…')
  const res = await appFetch('/api/onboarding/import', {
    method: 'POST',
    body: JSON.stringify({ sources: SOURCES, freeText: '' }),
  }, session)

  if (res.status === 401) throw new Error('Auth rejected — cookie not accepted by Next.js route')
  if (res.status === 402) throw new Error('Budget exhausted — check ai_usage_periods for this church')
  const body = await res.json()
  if (!res.ok) throw new Error(`Import POST failed (${res.status}): ${JSON.stringify(body)}`)

  console.log(`  Job ID: ${body.job_id}`)
  // POST returns proposed_mapping synchronously after Stage A completes.
  // Build a job-shaped object so printQuestions works unchanged.
  return {
    id:               body.job_id,
    proposed_mapping: body.proposed_mapping,
    status:           'awaiting_confirmation',
  }
}

function printQuestions(job) {
  const mapping = job?.proposed_mapping
  if (!mapping) { console.log('\n⚠ No proposed_mapping in job — Stage A may still be processing.'); return }

  const qs = mapping.clarification_questions ?? []
  if (qs.length === 0) {
    console.log('\n✓ Stage A produced no clarification questions — mapping was high-confidence.')
    console.log('  You can proceed directly to import.')
    return
  }

  const blocking = qs.filter(q => q.blocking)
  const optional = qs.filter(q => !q.blocking)

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Stage A complete — ${qs.length} question(s) (${blocking.length} required, ${optional.length} optional)`)
  console.log(`${'═'.repeat(60)}\n`)

  qs.forEach((q, i) => {
    const tag = q.blocking ? '[REQUIRED]' : '[optional]'
    const group = q.topic_group ? ` [${q.topic_group}]` : ''
    console.log(`Q${i + 1} ${tag}${group}`)
    if (q.title)   console.log(`   Title:   ${q.title}`)
    if (q.context) console.log(`   Context: ${q.context}`)
    console.log(`   ${q.question}`)
    if (q.options) {
      q.options.forEach((o, oi) => {
        const code = o.meaning_code ? ` (code: ${o.meaning_code})` : ''
        console.log(`     ${oi + 1}. ${o.label}${code}`)
        console.log(`        ${o.explanation}`)
      })
    }
    if (q.recommended_answer && !q.options) {
      console.log(`   Recommended: ${q.recommended_answer}`)
    }
    if (q.why) console.log(`   Why: ${q.why}`)
    console.log()
  })

  console.log(`${'─'.repeat(60)}`)
  console.log(`Job ID: ${job.id}`)
  console.log(`Use this job_id to open the confirm page in your browser:`)
  console.log(`  http://localhost:3000/onboarding/import/confirm?job_id=${job.id}`)
  console.log()
}

// ── Run ───────────────────────────────────────────────────────────────────────

try {
  const session = await provisionChurch()
  const job     = await submitImport(session)
  printQuestions(job)
} catch (err) {
  console.error('\n✗', err.message)
  process.exit(1)
}
