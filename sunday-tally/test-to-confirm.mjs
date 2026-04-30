/**
 * Runs signup → import → Stage A, then pauses on the confirm page
 * so you can read and answer the questions manually in the browser.
 *
 * Usage: node test-to-confirm.mjs
 * The browser stays open. Answer the questions, then press Enter in this terminal to close.
 */

import { chromium } from 'playwright'

const BASE_URL  = 'http://localhost:3000'
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?usp=sharing&gid=1378199377#gid=1378199377'
const EMAIL     = `test-${Date.now()}@sundaytally-test.com`
const PASSWORD  = 'TestChurch123!'

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 })
  const page    = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  // ── 1. Sign up ──────────────────────────────────────────────────────────────
  console.log('→ Signing up...')
  await page.goto(`${BASE_URL}/signup`)
  await page.waitForLoadState('networkidle')
  await page.fill('#churchName', 'Test Church')
  await page.fill('#ownerName',  'Test Owner')
  await page.fill('#email',      EMAIL)
  await page.fill('#password',   PASSWORD)
  await page.click('button[type="submit"]')
  // Wait for redirect to /onboarding/church (server action sets session cookie first)
  await page.waitForURL(u => u.toString().includes('/onboarding/church'), { timeout: 30000 })
    .catch(() => console.warn('  (did not reach /onboarding/church — current URL:', page.url(), ')'))
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  console.log(`  signed up as ${EMAIL} — now at ${page.url()}`)

  // ── 2. Go to import ─────────────────────────────────────────────────────────
  console.log('→ Navigating to import page...')
  await page.goto(`${BASE_URL}/onboarding/import`)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  // Take a screenshot to debug if input not found
  await page.screenshot({ path: 'debug-import-page.png' }).catch(() => {})

  // ── 3. Fill the sheet URL ───────────────────────────────────────────────────
  const urlInput = page.locator('input[placeholder*="docs.google"]').first()
  await urlInput.waitFor({ timeout: 30000 })
  await urlInput.fill(SHEET_URL)

  const textarea = page.locator('textarea').first()
  await textarea.fill(
    'Sunday morning (9am and 11am) and Sunday evening services. ' +
    'Kids Church and Youth Ministry tracked separately. ' +
    'Giving tracked by cash, check, and online.'
  ).catch(() => {})

  // ── 4. Submit Stage A ───────────────────────────────────────────────────────
  console.log('→ Submitting to Claude (Stage A) — this takes ~30-90s...')
  const apiDone = page.waitForResponse(
    r => r.url().includes('/api/onboarding/import') && r.request().method() === 'POST',
    { timeout: 150000 }
  )
  await page.click('button:has-text("Propose mapping")')
  const res  = await apiDone
  const body = await res.json().catch(() => ({}))
  console.log(`  Stage A done — status ${res.status()}, cost ${body.total_cents ?? '?'}¢`)

  // ── 5. Wait for confirm page ────────────────────────────────────────────────
  await page.waitForURL(u => u.toString().includes('/confirm'), { timeout: 30000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

  // Wait for loading to resolve
  await page.waitForFunction(
    () => !document.body.textContent?.includes('Reviewing your data'),
    { timeout: 20000 }
  ).catch(() => {})

  console.log('\n════════════════════════════════════════════════')
  console.log('  CONFIRM PAGE LOADED — answer the questions in')
  console.log('  the browser, then press Enter here when done.')
  console.log('════════════════════════════════════════════════\n')

  // Dump the questions to the terminal so you can read them here too
  const questions = await page.evaluate(() => {
    const els = document.querySelectorAll('p.font-medium.text-gray-900, p.text-sm.font-medium.text-gray-900')
    return Array.from(els).map(el => el.textContent?.trim()).filter(Boolean)
  })
  if (questions.length > 0) {
    console.log('Questions detected on page:')
    questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`))
    console.log()
  }

  // Keep browser open until user presses Enter
  await new Promise(resolve => process.stdin.once('data', resolve))
  await browser.close()
})()
