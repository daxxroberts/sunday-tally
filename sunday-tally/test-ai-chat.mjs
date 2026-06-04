import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const BASE = 'http://localhost:3000'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY'
const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co'
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const TS = Date.now()
const EMAIL = `test.chat.${TS}@sundaytally.test`
const PASS  = 'TestPass123!'
const CHURCH_NAME = `Chat Test Church ${TS}`

let userId = null

async function runTest() {
  console.log('--- Starting AI Chat Interaction Test ---')
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser Error] ${msg.text()}`)
  })

  try {
    // 1. Signup
    console.log('1. Signing up new user...')
    await page.goto(`${BASE}/signup`)
    await page.fill('[id="churchName"]', CHURCH_NAME)
    await page.fill('[id="ownerName"]', 'Pastor AI')
    await page.fill('[id="email"]', EMAIL)
    await page.fill('[id="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(services|onboarding)/, { timeout: 15000 })
    console.log('✓ Signed up successfully')

    // 2. Go to Import Upload
    console.log('2. Navigating to Import Upload...')
    await page.goto(`${BASE}/onboarding/import`)
    await page.waitForLoadState('networkidle')

    // 3. Paste CSV Data
    console.log('3. Uploading dummy CSV data...')
    const csvData = `Date,9AM Attendance,11AM Attendance,Tithes
2026-05-03,150,200,5000
2026-05-10,160,210,5200`
    
    // The file input for CSV
    await page.setInputFiles('input[type="file"]', {
      name: 'dummy_giving_data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvData)
    })
    
    await page.click('button:has-text("Propose mapping →")')

    // 4. Wait for redirection to review page
    console.log('4. Waiting for AI extraction and redirect to Review page...')
    await page.waitForURL(/\/onboarding\/import\/review\?job_id=/, { timeout: 120000 })
    console.log('✓ Reached Review page:', page.url())

    // 5. Test Chat Interaction
    console.log('5. Testing AI Chat Interaction...')
    await page.waitForSelector('input[placeholder="Ask a question or request a change..."]', { timeout: 10000 })
    
    await page.fill('input[placeholder="Ask a question or request a change..."]', 'Make sure Tithes is not a row, it should be a column')
    await page.click('button[type="submit"]')
    
    console.log('Waiting for AI streaming response...')
    // Wait for the streaming indicator to appear then disappear
    await page.waitForTimeout(1000) // let the state update
    // Wait until the input is re-enabled (meaning streaming finished)
    await page.waitForSelector('input:not([disabled])', { timeout: 60000 })
    
    const messages = await page.locator('.flex.justify-start .bg-gray-800').allTextContents()
    console.log(`✓ AI Responded! Last response: "${messages[messages.length - 1].substring(0, 50)}..."`)

    // 6. Confirm & Import
    console.log('6. Testing Confirm & Import...')
    await page.click('button:has-text("Confirm & Import")')
    
    try {
      const errorMsg = await page.locator('[role="alert"]').textContent({ timeout: 5000 })
      if (errorMsg) throw new Error(`UI Error: ${errorMsg}`)
    } catch (e) {
      if (e.message.includes('UI Error')) throw e
    }
    
    await page.waitForSelector('text="Your data has been imported"', { timeout: 60000 })
    console.log('✓ Successfully imported data to database!')

  } catch (err) {
    console.error('❌ Test Failed:', err.message)
    await page.screenshot({ path: `test-screenshots/error-chat-test-${TS}.png`, fullPage: true })
    process.exitCode = 1
  } finally {
    await browser.close()
    
    // Cleanup
    if (EMAIL) {
      const { data: { users } } = await admin.auth.admin.listUsers()
      const u = users.find(u => u.email === EMAIL)
      if (u) {
        await admin.auth.admin.deleteUser(u.id)
        console.log('Cleaned up test user')
      }
    }
  }
}

runTest()
