/**
 * seed-demo-church.mjs
 *
 * Creates a dummy owner account + church shell so the AI import flow
 * at /onboarding/import can take over with the Google Sheet.
 *
 * Usage: node scripts/seed-demo-church.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * in .env.local (already present).
 */

import { createClient } from '@supabase/supabase-js'
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

const SUPABASE_URL      = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// ── Config ───────────────────────────────────────────────────────────────────

const DEMO_EMAIL    = 'demo@sundaytally.dev'
const DEMO_PASSWORD = 'SundayTally123!'
const CHURCH_NAME   = 'Demo Church'
const CHURCH_SLUG   = 'demo-church'

// ── Admin client (bypasses RLS) ──────────────────────────────────────────────

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n── SundayTally Demo Seed ────────────────────────────────')

// 1. Check if user already exists
console.log(`\n[1/3] Creating auth user: ${DEMO_EMAIL}`)

const { data: existingList } = await admin.auth.admin.listUsers()
const existing = existingList?.users?.find(u => u.email === DEMO_EMAIL)

let userId

if (existing) {
  console.log(`  ✓ User already exists: ${existing.id}`)
  userId = existing.id
} else {
  const { data: newUser, error: userErr } = await admin.auth.admin.createUser({
    email:             DEMO_EMAIL,
    password:          DEMO_PASSWORD,
    email_confirm:     true,
    user_metadata:     { full_name: 'Demo Owner' },
  })

  if (userErr) {
    console.error('  ✗ Failed to create user:', userErr.message)
    process.exit(1)
  }

  userId = newUser.user.id
  console.log(`  ✓ Created: ${userId}`)
}

// 2. Check if church already exists for this user
console.log(`\n[2/3] Creating church: "${CHURCH_NAME}"`)

const { data: existingMembership } = await admin
  .from('church_memberships')
  .select('church_id, churches(name)')
  .eq('user_id', userId)
  .eq('is_active', true)
  .maybeSingle()

let churchId

if (existingMembership) {
  churchId = existingMembership.church_id
  // @ts-ignore
  const existingName = existingMembership.churches?.name ?? '(unknown)'
  console.log(`  ✓ Church already exists: "${existingName}" (${churchId})`)
} else {
  // Insert church (service role bypasses INSERT policy)
  const { data: church, error: churchErr } = await admin
    .from('churches')
    .insert({ name: CHURCH_NAME, slug: CHURCH_SLUG })
    .select('id')
    .single()

  if (churchErr) {
    // Slug collision — try with timestamp suffix
    const { data: church2, error: churchErr2 } = await admin
      .from('churches')
      .insert({ name: CHURCH_NAME, slug: `${CHURCH_SLUG}-${Date.now()}` })
      .select('id')
      .single()

    if (churchErr2) {
      console.error('  ✗ Failed to create church:', churchErr2.message)
      process.exit(1)
    }
    churchId = church2.id
  } else {
    churchId = church.id
  }

  console.log(`  ✓ Created: ${churchId}`)

  // 3. Link user → church as owner
  console.log(`\n[3/3] Creating membership (role: owner)`)

  const { error: memErr } = await admin
    .from('church_memberships')
    .insert({
      church_id:   churchId,
      user_id:     userId,
      role:        'owner',
      is_active:   true,
      accepted_at: new Date().toISOString(),
    })

  if (memErr) {
    console.error('  ✗ Failed to create membership:', memErr.message)
    process.exit(1)
  }

  console.log('  ✓ Owner membership created')
}

// ── Done ─────────────────────────────────────────────────────────────────────

console.log(`
────────────────────────────────────────────────────
  ✓ Demo church is ready.

  Login URL : http://localhost:3000/auth/login
  Email     : ${DEMO_EMAIL}
  Password  : ${DEMO_PASSWORD}
  Church ID : ${churchId}

  Next step : Log in → go to http://localhost:3000/onboarding/church
              Then click "Import with AI instead"
              Paste the Google Sheets URL and hit "Propose mapping"
────────────────────────────────────────────────────
`)
