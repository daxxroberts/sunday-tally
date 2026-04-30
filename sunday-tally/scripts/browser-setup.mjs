/**
 * browser-setup.mjs
 *
 * Opens a real browser, logs in as the demo account, navigates to the
 * "Import with AI instead" screen, pastes the Google Sheet URL, and
 * clicks "Propose mapping". Leaves the browser open at the confirm screen
 * for the user to take over.
 *
 * Usage: node scripts/browser-setup.mjs
 */

import { chromium } from 'playwright'

const EMAIL    = 'demo@sundaytally.dev'
const PASSWORD = 'SundayTally123!'
const APP      = 'http://localhost:3000'
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?usp=sharing'

console.log('\n── SundayTally Browser Setup ────────────────────────────')

const browser = await chromium.launch({
  headless: false,
  slowMo: 300,
})

const page = await browser.newPage()
page.setDefaultTimeout(30_000)

// ── Step 1: Login ─────────────────────────────────────────────────────────────
console.log('\n[1/4] Navigating to login...')
await page.goto(`${APP}/auth/login`)
await page.waitForLoadState('networkidle')

// Enter email
await page.fill('input[type="email"]', EMAIL)

// Click Password tab if not already selected
const passwordTab = page.locator('button:has-text("Password")')
if (await passwordTab.isVisible()) {
  await passwordTab.click()
  await page.waitForTimeout(300)
}

// Enter password
await page.fill('input[type="password"]', PASSWORD)

// Submit
await page.click('button[type="submit"]')
console.log('  → Logged in, waiting for redirect...')

// Wait for navigation away from login
await page.waitForURL(url => !url.toString().includes('/auth/login'), { timeout: 15_000 })
console.log('  ✓ Redirected to:', page.url())

// ── Step 2: Navigate directly to import page ─────────────────────────────────
// Church is already created — skip onboarding/church and go straight to import
console.log('\n[2/4] Navigating directly to import page...')

await page.waitForLoadState('networkidle')
await page.goto(`${APP}/onboarding/import`)
await page.waitForLoadState('networkidle')
console.log('  ✓ On import page:', page.url())

// ── Step 4: Paste the Google Sheet URL and submit ─────────────────────────────
console.log('\n[4/4] Filling in Google Sheet URL...')

// The sheet URL input — second input in the Google Sheets section
await page.waitForSelector('input[placeholder*="docs.google.com"]', { timeout: 10_000 })
await page.fill('input[placeholder*="docs.google.com"]', SHEET_URL)

// Optional label
const labelInput = page.locator('input[placeholder="Label (optional)"]').first()
if (await labelInput.isVisible()) {
  await labelInput.fill('Sunday Data')
}

console.log('  ✓ Sheet URL entered')
console.log('\n  Clicking "Propose mapping" — AI analysis will take 30–90 seconds...')

// Click propose
await page.click('button:has-text("Propose mapping")')

// Wait for navigation to confirm page (Stage A result)
console.log('  ⏳ Waiting for Stage A to complete...')
await page.waitForURL(url => url.toString().includes('/import/confirm'), {
  timeout: 180_000,
})

console.log('\n  ✓ Stage A complete. Browser is at:', page.url())
console.log('\n────────────────────────────────────────────────────────')
console.log('  The browser is now showing the proposed mapping.')
console.log('  Hand off to the user — they can review and confirm.')
console.log('────────────────────────────────────────────────────────')

// Keep browser open — do NOT call browser.close()
// User takes over from here
