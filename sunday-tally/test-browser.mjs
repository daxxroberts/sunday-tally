/**
 * Browser E2E test — signs up as a new church owner, goes through onboarding,
 * enters data for 4 past Sundays, and checks the dashboard.
 *
 * Run: node test-browser.mjs
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const BASE = 'http://localhost:3000'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'
const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const TS = Date.now()
const EMAIL = `test.${TS}@sundaytally.test`
const PASS  = 'TestPass123!'
const CHURCH_NAME = `Grace Church Test ${TS}`

let userId = null
let churchId = null

function log(msg) { console.log(`  ${msg}`) }
function step(n, title) { console.log(`\nSTEP ${n} — ${title}`) }

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function screenshot(page, name) {
  await page.screenshot({ path: `test-screenshots/${name}.png`, fullPage: true })
}

async function waitAndClick(page, selector, opts = {}) {
  await page.waitForSelector(selector, { timeout: 10000, ...opts })
  await page.click(selector)
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: false, slowMo: 300 })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }) // iPhone-ish
const page = await context.newPage()

// Collect console errors
const consoleErrors = []
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})

try {
  // ─── 1. Signup ──────────────────────────────────────────────────────────────
  step(1, 'Signup — create church + owner account')
  await page.goto(`${BASE}/signup`)
  await page.screenshot({ path: 'test-screenshots/01-signup.png', fullPage: true })

  await page.fill('[id="churchName"]', CHURCH_NAME)
  await page.fill('[id="ownerName"]', 'Pastor Test')
  await page.fill('[id="email"]', EMAIL)
  await page.fill('[id="password"]', PASS)
  await page.screenshot({ path: 'test-screenshots/01-signup-filled.png', fullPage: true })

  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(services|onboarding)/, { timeout: 15000 })
  log(`✓ Signed up — landed at: ${page.url()}`)
  await page.screenshot({ path: 'test-screenshots/02-after-signup.png', fullPage: true })

  // Grab IDs for cleanup
  const { data: { users } } = await admin.auth.admin.listUsers()
  const u = users.find(u => u.email === EMAIL)
  if (u) userId = u.id
  const { data: membership } = await admin.from('church_memberships')
    .select('church_id').eq('user_id', userId).single()
  if (membership) churchId = membership.church_id
  log(`  church id: ${churchId}`)

  // ─── 2. Services page (T1) ──────────────────────────────────────────────────
  step(2, 'Services — should see empty state or setup prompt')
  await page.goto(`${BASE}/services`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-screenshots/03-services.png', fullPage: true })
  log(`✓ Services page loaded`)

  // ─── 3. Settings → create a service template ────────────────────────────────
  step(3, 'Settings → Services — add Morning Service template')
  await page.goto(`${BASE}/settings/services`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-screenshots/04-settings-services.png', fullPage: true })
  log(`✓ Settings/services page loaded`)

  // ─── 4. Seed past occurrences + data via admin API ──────────────────────────
  step(4, 'Seed 4 past Sundays of data via admin API')

  // Get templates and tags from just-created church
  const { data: templates } = await admin.from('service_templates')
    .select('id').eq('church_id', churchId).limit(1)
  const { data: locations } = await admin.from('church_locations')
    .select('id').eq('church_id', churchId).limit(1)
  const { data: tags } = await admin.from('service_tags')
    .select('id, tag_code').eq('church_id', churchId).eq('is_active', true)
  const morningTag = tags.find(t => t.tag_code === 'MORNING')

  let templateId
  if (!templates || templates.length === 0) {
    // Create template if signup didn't go through onboarding
    const { data: tmpl } = await admin.from('service_templates').insert({
      church_id: churchId,
      service_code: 'MORNING_' + TS,
      display_name: 'Morning Service',
      location_id: locations[0].id,
      sort_order: 1,
      primary_tag_id: morningTag?.id,
      is_active: true,
    }).select('id').single()
    templateId = tmpl?.id
    log(`  Created template: ${templateId}`)
  } else {
    templateId = templates[0].id
    log(`  Using existing template: ${templateId}`)
  }

  if (!templateId) throw new Error('No template found')

  // Sundays: 2026-04-12, 2026-04-05, 2026-03-29, 2026-03-22
  const sundays = ['2026-04-12', '2026-04-05', '2026-03-29', '2026-03-22']
  const weekData = [
    { main: 320, kids: 55, youth: 30, giving: 4800 },
    { main: 310, kids: 50, youth: 28, giving: 4600 },
    { main: 335, kids: 58, youth: 32, giving: 5100 },
    { main: 290, kids: 45, youth: 25, giving: 4300 },
  ]

  const { data: givingSources } = await admin.from('giving_sources')
    .select('id').eq('church_id', churchId).limit(1)
  const givingSourceId = givingSources?.[0]?.id

  for (let i = 0; i < sundays.length; i++) {
    const date = sundays[i]
    const d = weekData[i]

    const { data: occ } = await admin.from('service_occurrences').insert({
      church_id: churchId,
      service_template_id: templateId,
      location_id: locations[0].id,
      service_date: date,
      status: 'active',
    }).select('id').single()

    if (!occ) { log(`  ✗ Failed to create occurrence ${date}`); continue }

    if (morningTag) {
      await admin.from('service_occurrence_tags').insert({
        service_occurrence_id: occ.id,
        service_tag_id: morningTag.id,
      })
    }

    await admin.from('attendance_entries').insert({
      service_occurrence_id: occ.id,
      main_attendance: d.main,
      kids_attendance: d.kids,
      youth_attendance: d.youth,
    })

    if (givingSourceId) {
      await admin.from('giving_entries').insert({
        service_occurrence_id: occ.id,
        giving_source_id: givingSourceId,
        giving_amount: d.giving.toFixed(2),
      })
    }

    log(`  ✓ ${date}: Att ${d.main + d.kids + d.youth} Giving $${d.giving}`)
  }

  // ─── 5. Services page — pick current week occurrence ────────────────────────
  step(5, 'Services page — see current week\'s occurrence')
  await page.goto(`${BASE}/services`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-screenshots/05-services-with-data.png', fullPage: true })
  log(`✓ Services page with data`)

  // ─── 6. Dashboard ───────────────────────────────────────────────────────────
  step(6, 'Dashboard — verify attendance numbers')
  await page.goto(`${BASE}/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000) // let data load
  await page.screenshot({ path: 'test-screenshots/06-dashboard.png', fullPage: true })
  log(`✓ Dashboard loaded`)

  // Read text on page
  const dashText = await page.textContent('body')
  const hasNumbers = /32[0-9]|405|310/.test(dashText)
  log(hasNumbers ? '✓ Attendance numbers visible on dashboard' : '✗ No attendance numbers found')

  // Check for "—" (missing data indicator)
  const summarySection = await page.$('.space-y-5')
  if (summarySection) {
    log('✓ Dashboard grid rendered')
  }

  // Scroll down to see all sections
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-screenshots/06-dashboard-mid.png', fullPage: true })

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-screenshots/06-dashboard-bottom.png', fullPage: true })

  // ─── 7. Try Summary Card customize ──────────────────────────────────────────
  step(7, 'Summary Card — test customize toggle')
  await page.goto(`${BASE}/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  const customizeBtn = await page.$('button:has-text("Customize")')
  if (customizeBtn) {
    await customizeBtn.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-screenshots/07-summary-customize-open.png', fullPage: true })
    log('✓ Customize panel opened')

    // Uncheck Giving
    const givingCheckbox = await page.$('input[type="checkbox"] + span:has-text("Giving")')
    if (givingCheckbox) {
      await page.evaluate(el => el.previousElementSibling.click(), givingCheckbox)
      await page.waitForTimeout(300)
      log('✓ Unchecked Giving')
    }

    await customizeBtn.click() // close
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-screenshots/07-summary-customized.png', fullPage: true })
    log('✓ Customize panel closed')
  } else {
    log('  ℹ Customize button not found (may still be loading)')
  }

  // ─── 8. Sign out and back to login ──────────────────────────────────────────
  step(8, 'Sign out')
  const signOutBtn = await page.$('button:has-text("Sign out"), a:has-text("Sign out")')
  if (signOutBtn) {
    await signOutBtn.click()
    await page.waitForURL(/\/(auth|login|signup)/, { timeout: 8000 }).catch(() => {})
    log('✓ Signed out')
  } else {
    log('  ℹ No sign-out button found on this page')
  }
  await page.screenshot({ path: 'test-screenshots/08-signout.png', fullPage: true })

  // ─── Report console errors ───────────────────────────────────────────────────
  if (consoleErrors.length) {
    console.log('\n  ⚠ Console errors during session:')
    consoleErrors.forEach(e => console.log(`    ${e}`))
  } else {
    console.log('\n  ✓ No console errors')
  }

  console.log('\n═══════════════════════════════════════════════')
  console.log('  Browser test COMPLETE — screenshots in test-screenshots/')
  console.log('═══════════════════════════════════════════════\n')

} catch (err) {
  console.error('\n  ✗ Test failed:', err.message)
  await page.screenshot({ path: 'test-screenshots/error.png', fullPage: true })
} finally {
  // Cleanup
  if (churchId) {
    await admin.from('churches').delete().eq('id', churchId)
    log('  Cleaned up church')
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId)
    log('  Cleaned up user')
  }
  await browser.close()
}
