/**
 * setup-test-church.mjs
 * Creates a clean test church for import testing.
 *
 * Strategy: insert the new membership with a very old created_at so the
 * import API (which picks ORDER BY created_at ASC) routes to the new church
 * — without touching or deactivating existing memberships.
 *
 * Run:  node scripts/setup-test-church.mjs
 * Undo: node scripts/setup-test-church.mjs --teardown <church_id>
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TARGET_EMAIL = 'test-import@sundaytally.dev'

// ── Teardown mode ─────────────────────────────────────────────────────────────
const teardownArg = process.argv.indexOf('--teardown')
if (teardownArg !== -1) {
  const churchId = process.argv[teardownArg + 1]
  if (!churchId) { console.error('Usage: --teardown <church_id>'); process.exit(1) }
  await admin.from('church_memberships').delete().eq('church_id', churchId)
  await admin.from('churches').delete().eq('id', churchId)
  console.log(`\n✓ Test church ${churchId} removed.\n`)
  process.exit(0)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Find user
const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
const user = users.find(u => u.email === TARGET_EMAIL)
if (!user) { console.error(`User ${TARGET_EMAIL} not found`); process.exit(1) }

// Create church
const slug = `test-church-${Date.now()}`
const { data: church, error: churchErr } = await admin
  .from('churches')
  .insert({ name: 'Test Church — May 2026', slug })
  .select('id')
  .single()
if (churchErr || !church) { console.error('Failed to create church:', churchErr?.message); process.exit(1) }

// Create membership with an old created_at so it wins ORDER BY created_at ASC
const { error: memErr } = await admin
  .from('church_memberships')
  .insert({
    user_id:    user.id,
    church_id:  church.id,
    role:       'owner',
    is_active:  true,
    created_at: '2019-01-01T00:00:00.000Z',
  })
if (memErr) { console.error('Failed to create membership:', memErr.message); process.exit(1) }

// ── Build the import URL ───────────────────────────────────────────────────────
const sheets = [
  { n: 'Sunday Services',  s: 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?gid=1378199377#gid=1378199377' },
  { n: 'Switch (Youth)',   s: 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?gid=282060338#gid=282060338' },
  { n: 'Giving',           s: 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?gid=181499763#gid=181499763' },
]
const qs = sheets
  .map((sh, i) => `n${i + 1}=${encodeURIComponent(sh.n)}&s${i + 1}=${encodeURIComponent(sh.s)}`)
  .join('&')

const importUrl = `http://localhost:3000/onboarding/import?${qs}`

console.log(`
✓ Test church created:   ${church.id}
✓ Membership inserted:   owner @ 2019-01-01 (wins import routing)
✓ User:                  ${TARGET_EMAIL}

Open this URL in your browser:
${importUrl}

To tear down after testing:
  node scripts/setup-test-church.mjs --teardown ${church.id}
`)
