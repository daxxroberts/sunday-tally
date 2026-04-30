/**
 * AI Setup Flow — End-to-End Test & Error Logger v2
 * Captures every redirect, HTTP status, and browser error across:
 * Signup → Onboarding → AI Import (Google Sheet) → Confirm → Dashboard
 */

import { chromium } from 'playwright'
import { writeFileSync, appendFileSync } from 'fs'

const BASE_URL = 'http://localhost:3000'
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1G8G5cOa4f_0aq3R_z5MfwqKVr5NNL9IYsgCQtmMmS04/edit?usp=sharing&gid=1378199377#gid=1378199377'
const TEST_EMAIL = `test-church-${Date.now()}@sundaytally-test.com`
const TEST_PASSWORD = 'TestChurch123!'
const LOG_FILE = 'test-ai-setup-errors.log'
const FULL_LOG = 'test-ai-setup-full.log'

const errors = []
const log = []

function ts() { return new Date().toISOString() }

function record(type, step, detail, extra = {}) {
  const entry = { time: ts(), type, step, detail, ...extra }
  log.push(entry)
  const line = `[${type}] ${step}: ${detail}`
  console.log(line)
  appendFileSync(FULL_LOG, JSON.stringify(entry) + '\n')
  if (type === 'ERROR' || type === 'WARN') {
    appendFileSync(LOG_FILE, line + '\n')
    errors.push(entry)
  }
}

writeFileSync(LOG_FILE, `=== AI Setup Test Run — ${ts()} ===\nTest email: ${TEST_EMAIL}\n\n`)
writeFileSync(FULL_LOG, `=== Full Log — ${ts()} ===\n`)

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  // ── Capture ALL browser console messages
  page.on('console', msg => {
    const text = msg.text()
    appendFileSync(FULL_LOG, JSON.stringify({ time: ts(), type: `BROWSER-${msg.type()}`, text }) + '\n')
    if (msg.type() === 'error') record('ERROR', 'browser-console', text)
    else if (msg.type() === 'warn') record('WARN', 'browser-console', text)
  })

  // ── Capture all uncaught page errors
  page.on('pageerror', err => {
    record('ERROR', 'page-exception', err.message, { stack: err.stack?.slice(0, 300) })
  })

  // ── Capture ALL outgoing requests
  page.on('request', req => {
    if (req.method() !== 'GET' && req.method() !== 'OPTIONS') {
      appendFileSync(FULL_LOG, JSON.stringify({ time: ts(), type: 'REQUEST', method: req.method(), url: req.url() }) + '\n')
      console.log(`[REQUEST] ${req.method()} ${req.url()}`)
    }
  })

  // ── Capture ALL HTTP responses (including redirects)
  page.on('response', async res => {
    const status = res.status()
    const url = res.url()
    const line = `[HTTP] ${status} ${url}`
    appendFileSync(FULL_LOG, line + '\n')
    if (status >= 400) {
      let body = ''
      try { body = await res.text() } catch {}
      record('ERROR', 'http-error', `${status} ${url}`, { body: body.slice(0, 500) })
    }
    if (status >= 300 && status < 400 && status !== 304 && status !== 303) {
      record('WARN', 'http-redirect', `${status} → ${res.headers()['location'] ?? '?'} (from ${url})`)
    }
  })

  // ── Capture all navigations
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      appendFileSync(FULL_LOG, JSON.stringify({ time: ts(), type: 'NAVIGATE', url: frame.url() }) + '\n')
      console.log(`[NAV] → ${frame.url()}`)
    }
  })

  // ── STEP 1: Sign up ──────────────────────────────────────────────────────
  record('INFO', 'signup', `Navigating to ${BASE_URL}/signup`)
  await page.goto(`${BASE_URL}/signup`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'screenshots/01-signup.png' })

  await page.fill('#churchName', 'Test Church AI')
  await page.fill('#ownerName', 'Test Owner')
  await page.fill('#email', TEST_EMAIL)
  await page.fill('#password', TEST_PASSWORD)
  await page.screenshot({ path: 'screenshots/02-signup-filled.png' })

  record('INFO', 'signup', 'Clicking "Create my church"')
  await page.click('button[type="submit"]')

  // Wait for spinner to disappear (form is submitted)
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 30000 }).catch(() => {})
  // Also wait for networkidle to allow redirect to complete
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})

  const urlAfterSignup = page.url()
  record('INFO', 'signup', `URL after signup: ${urlAfterSignup}`)
  await page.screenshot({ path: 'screenshots/03-after-signup.png' })

  // Check for error on signup page
  const signupError = await page.locator('.text-red-600, [class*="red"]').first().isVisible().catch(() => false)
  if (signupError) {
    const errText = await page.locator('.text-red-600').first().textContent().catch(() => '')
    record('ERROR', 'signup', `Error shown on signup page: ${errText}`)
  }

  // ── STEP 2: Ensure logged in — try explicit login if needed ──────────────
  if (urlAfterSignup.includes('/auth/login') || urlAfterSignup.includes('/signup')) {
    record('WARN', 'auth', `Not redirected away from auth — attempting explicit login`)
    await page.fill('#email', TEST_EMAIL)
    await page.fill('#password', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    record('INFO', 'auth', `URL after login attempt: ${page.url()}`)
    await page.screenshot({ path: 'screenshots/03b-after-login.png' })
  }

  // ── STEP 3: Navigate to AI Import ────────────────────────────────────────
  record('INFO', 'import-nav', `Navigating to ${BASE_URL}/onboarding/import`)
  await page.goto(`${BASE_URL}/onboarding/import`)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  const importPageUrl = page.url()
  record('INFO', 'import-nav', `Landed on: ${importPageUrl}`)
  await page.screenshot({ path: 'screenshots/04-import-page.png' })

  if (!importPageUrl.includes('/onboarding/import')) {
    record('ERROR', 'import-nav', `REDIRECT: Expected /onboarding/import, got ${importPageUrl}`)
    const pageText = await page.locator('body').textContent().catch(() => '')
    record('INFO', 'import-nav', `Page content: ${pageText?.slice(0, 300)}`)
  }

  // ── STEP 4: Fill in Google Sheet URL ────────────────────────────────────
  const urlInput = page.locator('input[placeholder*="docs.google"]').first()
  const hasInput = await urlInput.isVisible({ timeout: 5000 }).catch(() => false)

  if (!hasInput) {
    record('ERROR', 'import-fill', 'Sheet URL input not visible — dumping page content')
    const pageText = await page.locator('body').textContent().catch(() => '')
    record('INFO', 'import-fill', `Page content: ${pageText?.slice(0, 500)}`)
  } else {
    await urlInput.fill(SHEET_URL)
    // Verify React state updated by reading the value back
    const urlValue = await urlInput.inputValue()
    record('INFO', 'import-fill', `Sheet URL entered — field value: ${urlValue.slice(0, 60)}`)

    // Intercept fetch to capture what's being sent
    await page.evaluate(() => {
      const origFetch = window.fetch
      window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '?'
        const method = args[1]?.method ?? 'GET'
        const body = args[1]?.body
        console.log(`[FETCH] ${method} ${url} body=${typeof body === 'string' ? body.slice(0, 200) : typeof body}`)
        try {
          const resp = await origFetch(...args)
          console.log(`[FETCH-RESP] ${resp.status} ${url}`)
          return resp
        } catch(e) {
          console.error(`[FETCH-ERR] ${method} ${url}: ${e.message}`)
          throw e
        }
      }
    })

    const labelInput = page.locator('input[placeholder="Label (optional)"]').first()
    await labelInput.fill('Church Attendance Data').catch(() => {})

    const textarea = page.locator('textarea').first()
    await textarea.fill(
      'Sunday morning (9am and 11am) and Sunday evening services. ' +
      'Kids Church and Youth Ministry tracked separately. ' +
      'Giving tracked by cash, check, and online.'
    ).catch(() => {})

    await page.screenshot({ path: 'screenshots/05-import-filled.png' })
    record('INFO', 'import-submit', 'Submitting to Stage A (Claude mapping) — may take 30–90s')

    // Dump any pre-existing [role="alert"] elements before clicking
    const preAlerts = await page.evaluate(() => {
      const els = document.querySelectorAll('[role="alert"]')
      return Array.from(els).map(el => ({ text: el.textContent, html: el.outerHTML.slice(0, 200) }))
    })
    if (preAlerts.length > 0) {
      record('WARN', 'import-pre-click', `Found ${preAlerts.length} [role="alert"] before click: ${JSON.stringify(preAlerts)}`)
    }

    // Set up response listener BEFORE clicking (standard Playwright pattern)
    const apiResponsePromise = page.waitForResponse(
      res => res.url().includes('/api/onboarding/import') && res.request().method() === 'POST',
      { timeout: 150000 }
    )

    await page.click('button:has-text("Propose mapping")')
    record('INFO', 'import-stageA', 'Clicked — waiting up to 150s for Stage A response from Claude...')

    let apiResult = { type: 'api-timeout', status: 0, body: '' }
    try {
      const res = await apiResponsePromise
      const status = res.status()
      let body = ''
      try { body = await res.text() } catch {}
      record('INFO', 'import-api', `Stage A API responded: ${status} — ${body.slice(0, 5000)}`)
      // Log usage
      try {
        const parsed = JSON.parse(body)
        if (parsed.total_cents != null) {
          const cents = parsed.total_cents
          record('INFO', 'usage-stageA', `Stage A cost: ${cents}¢  (~$${(cents/100).toFixed(4)})`)
        }
      } catch {}
      apiResult = { type: 'api', status, body }
    } catch (e) {
      record('ERROR', 'import-api', `Stage A timed out (150s): ${e.message}`)
    }

    if (apiResult.type === 'api' && apiResult.status === 200) {
      // Stage A submitted OK — wait for redirect to /confirm
      try {
        await page.waitForURL(url => url.toString().includes('/confirm'), { timeout: 120000 })
        record('INFO', 'import-stageA', 'Redirected to /confirm ✓')
      } catch (e) {
        record('ERROR', 'import-stageA', `Did not redirect to /confirm: ${e.message}`)
        // Check for visible error with text
        const visibleAlert = page.locator('[role="alert"]:visible')
        if (await visibleAlert.count() > 0) {
          const alertText = await visibleAlert.first().textContent()
          record('ERROR', 'import-stageA', `Visible error alert: "${alertText}"`)
        }
      }
    } else if (apiResult.type === 'api') {
      record('ERROR', 'import-stageA', `Stage A API error: ${apiResult.status} — ${apiResult.body?.slice(0, 300)}`)
    }

    const afterStageAUrl = page.url()
    record('INFO', 'import-stageA', `URL after Stage A: ${afterStageAUrl}`)
    await page.screenshot({ path: 'screenshots/06-stageA-result.png' })

    // Check for error banner (only if it has visible text content)
    const alert = page.locator('[role="alert"]').first()
    if (await alert.isVisible().catch(() => false)) {
      const alertText = (await alert.textContent().catch(() => '')).trim()
      if (alertText) record('ERROR', 'import-stageA', `Alert shown: ${alertText}`)
    }
  }

  // ── STEP 5: Confirm page (if we made it) ─────────────────────────────────
  if (page.url().includes('/confirm')) {
    record('INFO', 'confirm', `On confirm page`)

    // Log any /api/onboarding/import GET response on this page
    const importGetPromise = page.waitForResponse(
      res => res.url().includes('/api/onboarding/import') && res.request().method() === 'GET',
      { timeout: 20000 }
    ).then(async res => {
      let body = ''
      try { body = await res.text() } catch {}
      record('INFO', 'confirm-get-api', `GET /api/onboarding/import → ${res.status()}: ${body.slice(0, 400)}`)
    }).catch(e => {
      record('ERROR', 'confirm-get-api', `GET /api/onboarding/import never responded: ${e.message}`)
    })

    // Wait for GET /api/onboarding/import?job_id=... to complete
    // by watching for the loading spinner to disappear
    try {
      await page.waitForFunction(
        () => !document.body.textContent?.includes('Loading proposed mapping'),
        { timeout: 20000 }
      )
      record('INFO', 'confirm', 'Loading state resolved ✓')
    } catch (e) {
      record('ERROR', 'confirm', `Still showing "Loading proposed mapping…" after 20s — GET request may have failed`)
    }

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.screenshot({ path: 'screenshots/07-confirm.png' })

    // Log all failed API calls on this page
    const confirmPageContent = await page.locator('body').textContent().catch(() => '')
    record('INFO', 'confirm', `Page content: ${confirmPageContent?.slice(0, 600)}`)

    // Check for any error alerts
    const alertEls = await page.evaluate(() => {
      const els = document.querySelectorAll('[role="alert"], .text-red-700, .text-red-800')
      return Array.from(els).map(el => el.textContent?.trim()).filter(Boolean)
    })
    // Filter out the blocking-question "Required"/"Answered" badges — they are not errors
    const realAlerts = alertEls.filter(t => t && t !== 'Required' && t !== 'Answered')
    if (realAlerts.length > 0) {
      record('ERROR', 'confirm', `Error alerts: ${JSON.stringify(realAlerts)}`)
    }

    // Navigate through all confirm phases: mapping → review (optional) → preview
    // Click "Next" buttons until we reach the preview phase or run out of Next buttons
    let phaseClicks = 0
    while (phaseClicks < 5) {
      // Check if we've reached the "Confirm and import" button (preview phase)
      const confirmBtn = page.locator('button:has-text("Confirm and import")')
      if (await confirmBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        record('INFO', 'confirm-preview', `Reached preview phase after ${phaseClicks} clicks`)
        await page.screenshot({ path: `screenshots/0${8 + phaseClicks}-confirm-preview.png` })

        // Intercept Stage B API response
        const stageBPromise = page.waitForResponse(
          res => res.url().includes('/api/onboarding/import') && res.request().method() === 'PATCH',
          { timeout: 600000 }
        ).then(async res => {
          let body = ''
          try { body = await res.text() } catch {}
          record('INFO', 'stage-b', `Stage B API → ${res.status()}: ${body.slice(0, 5000)}`)
          // Log usage
          try {
            const parsed = JSON.parse(body)
            const cents = parsed.result?.totalCents
            if (cents != null) record('INFO', 'usage-stageB', `Stage B cost: ${cents}¢  (~$${(cents/100).toFixed(4)})`)
          } catch {}
        }).catch(e => record('ERROR', 'stage-b', `Stage B API never responded: ${e.message}`))

        record('INFO', 'confirm-preview', 'Clicking "Confirm and import →" — Stage B running (up to 10min)...')
        await confirmBtn.first().click()

        try {
          await page.waitForFunction(
            () => document.body.innerText?.includes('Your data has been imported') ||
                  document.body.innerText?.includes('extract failed') ||
                  (document.querySelector('[role="alert"]')?.textContent?.trim() ?? '') !== '',
            null,          // no arg to pass to the function
            { timeout: 600000 }  // 10 minutes
          )
        } catch (e) {
          record('ERROR', 'stage-b', `Stage B did not complete within 10 min: ${e.message}`)
        }

        await stageBPromise
        await page.screenshot({ path: 'screenshots/09-stageB-result.png' })
        const stageBContent = await page.locator('body').innerText().catch(() => '')
        record('INFO', 'stage-b', `Final result: ${stageBContent?.slice(0, 800)}`)

        // Check for success screen
        if (stageBContent?.includes('Your data has been imported')) {
          record('INFO', 'stage-b', '✓ Import successful!')
          // Button is now a <Link> (renders as <a>), use the text to find it
          const goToDashboardLink = page.locator('a:has-text("Go to your dashboard"), button:has-text("Go to your dashboard")')
          if (await goToDashboardLink.first().isVisible({ timeout: 5000 }).catch(() => false)) {
            await Promise.all([
              page.waitForURL(url => url.toString().includes('/dashboard'), { timeout: 15000 }).catch(() => {}),
              goToDashboardLink.first().click(),
            ])
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
            await page.screenshot({ path: 'screenshots/10-dashboard.png' })
            record('INFO', 'dashboard', `Dashboard URL: ${page.url()}`)
          } else {
            record('WARN', 'dashboard', 'Go to dashboard link not found on success screen')
          }
        }
        break
      }

      // Fill any blocking (required) questions before clicking Next.
      // Always target .nth(0) — the locator re-evaluates after each fill (answered ones turn green).
      {
        let qIdx = 0
        while (true) {
          const redTextareas = page.locator('.bg-red-50 textarea')
          const remaining = await redTextareas.count().catch(() => 0)
          if (remaining === 0) break
          const ta = redTextareas.nth(0)
          const currentVal = await ta.inputValue().catch(() => '')
          if (!currentVal.trim()) {
            await ta.fill('Service 1 = 9am Experience, Service 2 = 10:30am Experience')
            record('INFO', `confirm-blocking-q-${qIdx + 1}`, 'Filled blocking question with test answer')
          }
          qIdx++
          if (qIdx > 10) break // safety — never infinite loop
        }
        if (qIdx > 0) {
          record('INFO', `confirm-phase-${phaseClicks + 1}`, `Filled ${qIdx} required question(s)`)
          await page.waitForTimeout(500)
          await page.screenshot({ path: `screenshots/0${7 + phaseClicks}-blocking-answered.png` })
        }
      }

      // Find the next "Next" / "Answer questions" / "Preview data" button
      const nextBtn = page.locator('button:not([disabled])').filter({ hasText: /Next|Preview data|Answer questions/ }).first()
      if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const btnText = await nextBtn.textContent().catch(() => '?')
        record('INFO', `confirm-phase-${phaseClicks + 1}`, `Clicking: "${btnText?.trim()}"`)
        await page.screenshot({ path: `screenshots/0${7 + phaseClicks}-confirm-phase${phaseClicks + 1}.png` })
        await nextBtn.click()
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        phaseClicks++
      } else {
        // Check if button is disabled due to unanswered blocking questions
        const disabledBtn = page.locator('button[disabled]').filter({ hasText: /Answer required questions/ }).first()
        if (await disabledBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          record('ERROR', `confirm-phase-${phaseClicks + 1}`, 'Next button still disabled after filling blocking questions')
          break
        }
        record('WARN', 'confirm', `No Next button found at phase click ${phaseClicks} — checking visible buttons`)
        const buttons = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean)
        )
        record('INFO', 'confirm', `Visible buttons: ${JSON.stringify(buttons)}`)
        break
      }
    }
  }

  // ── Final state ──────────────────────────────────────────────────────────
  await page.screenshot({ path: 'screenshots/99-final-state.png' })
  record('INFO', 'complete', `Final URL: ${page.url()}`)

  // Write summary
  // Collect usage from log
  const usageLogs = log.filter(l => l.step?.startsWith('usage-'))
  let totalCentsAll = 0
  usageLogs.forEach(u => {
    const match = u.detail?.match(/(\d+)¢/)
    if (match) totalCentsAll += parseInt(match[1])
  })

  const summary = {
    time: ts(),
    test_email: TEST_EMAIL,
    final_url: page.url(),
    total_errors: errors.filter(e => e.type === 'ERROR').length,
    total_warnings: log.filter(l => l.type === 'WARN').length,
    ai_cost_cents: totalCentsAll,
    errors: errors.filter(e => e.type === 'ERROR').map(e => ({ step: e.step, detail: e.detail })),
  }
  writeFileSync('test-ai-setup-summary.json', JSON.stringify(summary, null, 2))

  console.log('\n════════════════════════════════')
  console.log('         TEST SUMMARY')
  console.log('════════════════════════════════')
  console.log(`Final URL:  ${summary.final_url}`)
  console.log(`Errors:     ${summary.total_errors}`)
  console.log(`Warnings:   ${summary.total_warnings}`)
  console.log(`AI Cost:    ${totalCentsAll}¢  (~$${(totalCentsAll/100).toFixed(4)})`)
  usageLogs.forEach(u => console.log(`  ${u.step}: ${u.detail}`))
  if (summary.errors.length > 0) {
    console.log('\nERRORS:')
    summary.errors.forEach((e, i) => console.log(`  ${i + 1}. [${e.step}] ${e.detail}`))
  }

  // Leave browser open for manual inspection
  // await browser.close()
})()
