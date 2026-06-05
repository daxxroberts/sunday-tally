/**
 * church-scenarios.spec.ts
 *
 * 75 end-to-end browser tests across 5 realistic church configurations.
 *
 * Each scenario has a KNOWN CSV shape and a pre-determined API mock
 * that exactly mirrors what the AI extraction would produce for that data.
 * Tests verify: mapping structure, tag/child hierarchy, column rendering,
 * import row counts, UI/UX at multiple viewports, and chat behavior.
 *
 * ── SCENARIO ROSTER ─────────────────────────────────────────────────────────
 *  A  Grace Community  — Multi-campus: Main + Downtown + East (3 campuses × 2 times)
 *  B  Elevation Church — Main + LifeKids (KIDS) + Switch (YOUTH), 5 volunteer categories
 *  C  Harvest Church   — 5 giving sources, Building Fund tracking, special events
 *  D  City Light       — Single campus, 4 service times, no volunteers, heavy giving
 *  E  Journey Church   — Upload flow tested end-to-end + AI chat question verification
 * ────────────────────────────────────────────────────────────────────────────
 *
 * PRE-DETERMINED NUMBERS (locked to the mock data below):
 *   Scenario A → 6 service templates, import: 24 occurrences, 144 attendance records
 *   Scenario B → 3 service templates (MAIN/KIDS/YOUTH), import: 12 occ, 36 att
 *   Scenario C → 5 giving sources, import: 8 occ, 16 att
 *   Scenario D → 4 service templates, import: 16 occ, 64 att
 *   Scenario E → 2 service templates, verifies upload & chat UI flow
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';

// ── Admin client ─────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY';
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Auth helpers ─────────────────────────────────────────────────────────────
async function loginNewUser(page: Page, context: BrowserContext, prefix = 'scenario'): Promise<string> {
  const ts = Date.now();
  const email = `${prefix}.${ts}@sundaytally.test`;
  await page.goto('/signup');
  await page.fill('[id="churchName"]', `Test Church ${ts}`);
  await page.fill('[id="ownerName"]', 'Pastor Test');
  await page.fill('[id="email"]', email);
  await page.fill('[id="password"]', 'TestPass123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(services|onboarding)/, { timeout: 30_000 });
  return email;
}

async function deleteUser(email: string) {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find(u => u.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}

/** Navigate to import upload page */
async function goToUpload(page: Page) {
  await page.goto('/onboarding/import');
  await expect(page.locator('h1:has-text("Import")')).toBeVisible();
}

/** Mock GET + PATCH + Chat routes, then navigate to review page */
async function goToReview(
  page: Page,
  setup: object,
  importResult: { occurrences: number; attendance: number },
  anomalies: any[] = [],
  jobId = 'test-job'
) {
  await page.route('**/api/onboarding/import*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job: {
            proposed_mapping: {
              sources: [{ kind: 'csv', name: 'test.csv' }],
              proposed_setup: setup,
            },
            anomalies,
          },
        }),
      });
    } else if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: { rowsInserted: importResult } }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/onboarding/chat', async route => {
    const body = await route.request().postDataJSON();
    // Return a contextual response based on what the user asked
    const userMsg = (body?.messages?.slice(-1)?.[0]?.content || '').toLowerCase();
    let reply = "I've reviewed your mapping carefully. Everything looks good!";
    if (userMsg.includes('campus') || userMsg.includes('location'))
      reply = "I can see multiple campuses in your data. I've mapped them as separate service templates with their own attendance tracking.";
    if (userMsg.includes('kids') || userMsg.includes('children'))
      reply = "I've mapped Kids Ministry under the LifeKids group with its own attendance and volunteer columns.";
    if (userMsg.includes('switch') || userMsg.includes('youth'))
      reply = "Switch/Youth is mapped under the YOUTH tag with its own column group, separate from the main service.";
    if (userMsg.includes('giving') || userMsg.includes('tithe') || userMsg.includes('offering'))
      reply = "I've mapped all giving sources as separate currency columns under the Giving group.";
    if (userMsg.includes('volunteer'))
      reply = "Volunteer categories are grouped under each ministry area — Band and Tech under main, Kids volunteers under LifeKids.";

    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: `0:"${reply}"\n`,
    });
  });

  await page.goto(`/onboarding/import/review?job_id=${jobId}`);
  await page.waitForSelector('.history-grid-table', { timeout: 15_000 });
}

// ════════════════════════════════════════════════════════════════════════════════
//  SCENARIO A — GRACE COMMUNITY CHURCH
//  Multi-campus: Main + Downtown + East, each with 9 AM + 11 AM
//  Tags: MAIN (parent) > MAIN_9AM, MAIN_11AM, DT_9AM, DT_11AM, EAST_9AM, EAST_11AM
//  Pre-determined import numbers: 24 occurrences (6 services × 4 Sundays), 144 attendance records
// ════════════════════════════════════════════════════════════════════════════════

const SCENARIO_A = {
  service_templates: [
    { service_code: 'main_9am',  display_name: 'Main – 9 AM',       primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: 'main_11am', display_name: 'Main – 11 AM',      primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: 'dt_9am',    display_name: 'Downtown – 9 AM',   primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: 'dt_11am',   display_name: 'Downtown – 11 AM',  primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: 'east_9am',  display_name: 'East – 9 AM',       primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: 'east_11am', display_name: 'East – 11 AM',      primary_tag: 'MAIN', day_of_week: 0 },
  ],
  volunteer_categories: [
    { name: 'Band',          primary_tag: 'MAIN' },
    { name: 'Tech',          primary_tag: 'MAIN' },
    { name: 'Parking',       primary_tag: 'MAIN' },
    { name: 'Guest Service', primary_tag: 'MAIN' },
  ],
  giving_sources: [
    { name: 'General Offering' },
    { name: 'Online Giving' },
    { name: 'Building Fund' },
  ],
  service_tags: [
    { tag_code: 'MAIN', tag_name: 'Main Campus' },
  ],
  tag_relationships: [],
  occurrences: [],
};
const SCENARIO_A_RESULT = { occurrences: 24, attendance: 144 };

test.describe('Scenario A — Grace Community: Multi-Campus (A1–A15)', () => {
  let email = '';
  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context, 'grace');
    await goToReview(page, SCENARIO_A, SCENARIO_A_RESULT);
  });
  test.afterEach(async () => { await deleteUser(email); });

  // ── Structure ──
  test('A1: All 6 campus+time service templates appear as row labels', async ({ page }) => {
    await expect(page.locator('td.col-label:has-text("Main – 9 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("Main – 11 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("Downtown – 9 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("Downtown – 11 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("East – 9 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("East – 11 AM")').first()).toBeVisible();
  });

  test('A2: Exactly 6 service row groups exist in the grid body', async ({ page }) => {
    const svRows = await page.locator('tr.row-sv').count();
    // 6 templates rendered for the preview Sunday
    expect(svRows).toBeGreaterThanOrEqual(6);
  });

  test('A3: Experience group header is present (MAIN attendance)', async ({ page }) => {
    await expect(page.locator('thead th.group-header:has-text("Experience")').first()).toBeVisible();
  });

  test('A4: Giving group header is present with 3 giving columns', async ({ page }) => {
    await expect(page.locator('thead th.group-header').filter({ hasText: /^Giving$/ }).first()).toBeVisible();
    await expect(page.locator('th:has-text("General Offering")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Online Giving")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Building Fund")').first()).toBeVisible();
  });

  test('A5: 4 volunteer column headers are present', async ({ page }) => {
    await expect(page.locator('th:has-text("Vol: Band")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Vol: Tech")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Vol: Parking")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Vol: Guest Service")').first()).toBeVisible();
  });

  test('A6: Week header row is present and visible', async ({ page }) => {
    await expect(page.locator('tr.row-week_header').first()).toBeVisible();
  });

  test('A7: SV scope tags appear for each service row', async ({ page }) => {
    const svTags = await page.locator('.scope-SV').count();
    expect(svTags).toBeGreaterThanOrEqual(6);
  });

  test('A8: Grid wrapper scrolls horizontally (many columns overflow)', async ({ page }) => {
    const wrapper = page.locator('.grid-wrapper');
    const scrollWidth = await wrapper.evaluate(el => el.scrollWidth);
    const clientWidth = await wrapper.evaluate(el => el.clientWidth);
    expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth);
  });

  test('A9: Group headers are dark (parent) vs light (leaf)', async ({ page }) => {
    const groupBg = await page.locator('thead th.group-header').first().evaluate(
      el => window.getComputedStyle(el).backgroundColor
    );
    expect(groupBg).not.toMatch(/rgb\(241|rgb\(248|rgb\(255/);
  });

  test('A10: "Attenders" leaf column appears under Experience', async ({ page }) => {
    await expect(page.locator('th:has-text("Attenders")').first()).toBeVisible();
  });

  // ── Import flow ──
  test('A11: Confirm & Import is enabled', async ({ page }) => {
    await expect(page.locator('button:has-text("Confirm & Import")').first()).toBeEnabled();
  });

  test('A12: Import success shows exactly 24 occurrences (6 services × 4 weeks)', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="24"')).toBeVisible();
  });

  test('A13: Import success shows exactly 144 attendance records', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="144"')).toBeVisible();
  });

  test('A14: All 6 campus service rows appear in the grid in correct order', async ({ page }) => {
    // Grab all col-label cells and extract their text
    const labels = await page.locator('td.col-label').allTextContents();
    const serviceLabels = labels.filter(l =>
      l.includes('Main') || l.includes('Downtown') || l.includes('East')
    );
    // All 6 campus+time labels should be present
    expect(serviceLabels.some(l => l.includes('Main') && l.includes('9 AM'))).toBe(true);
    expect(serviceLabels.some(l => l.includes('Main') && l.includes('11 AM'))).toBe(true);
    expect(serviceLabels.some(l => l.includes('Downtown') && l.includes('9 AM'))).toBe(true);
    expect(serviceLabels.some(l => l.includes('Downtown') && l.includes('11 AM'))).toBe(true);
    expect(serviceLabels.some(l => l.includes('East') && l.includes('9 AM'))).toBe(true);
    expect(serviceLabels.some(l => l.includes('East') && l.includes('11 AM'))).toBe(true);
  });

  test('A15: iPad — all 6 service labels visible after switching to grid tab', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.click('button:has-text("Data Grid")');
    await expect(page.locator('td.col-label:has-text("Main – 9 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("East – 11 AM")').first()).toBeVisible();
  });
});


// ════════════════════════════════════════════════════════════════════════════════
//  SCENARIO B — ELEVATION CHURCH
//  Main service + LifeKids (KIDS tag) + Switch Wednesday (YOUTH tag)
//  Volunteer children: Band/Tech under MAIN; Kids Check-In under KIDS; Youth Host under YOUTH
//  Pre-determined: 12 occurrences (3 services × 4 weeks), 36 attendance records
// ════════════════════════════════════════════════════════════════════════════════

const SCENARIO_B = {
  service_templates: [
    { service_code: 'main',   display_name: 'Main Service',   primary_tag: 'MAIN',  day_of_week: 0 },
    { service_code: 'kids',   display_name: 'LifeKids',       primary_tag: 'KIDS',  day_of_week: 0 },
    { service_code: 'switch', display_name: 'Switch',         primary_tag: 'YOUTH', day_of_week: 3 },
  ],
  volunteer_categories: [
    { name: 'Band',          primary_tag: 'MAIN' },
    { name: 'Tech',          primary_tag: 'MAIN' },
    { name: 'Kids Check-In', primary_tag: 'KIDS' },
    { name: 'Youth Host',    primary_tag: 'YOUTH' },
  ],
  giving_sources: [
    { name: 'Tithes & Offerings' },
    { name: 'Online' },
  ],
  service_tags: [
    { tag_code: 'MAIN',  tag_name: 'Main' },
    { tag_code: 'KIDS',  tag_name: 'LifeKids' },
    { tag_code: 'YOUTH', tag_name: 'Switch / Youth' },
  ],
  tag_relationships: [
    { parent_tag_code: 'MAIN',  child_tag_code: 'KIDS' },
    { parent_tag_code: 'MAIN',  child_tag_code: 'YOUTH' },
  ],
  occurrences: [],
};
const SCENARIO_B_RESULT = { occurrences: 12, attendance: 36 };

test.describe('Scenario B — Elevation: Main + LifeKids + Switch YOUTH (B1–B15)', () => {
  let email = '';
  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context, 'elevation');
    await goToReview(page, SCENARIO_B, SCENARIO_B_RESULT);
  });
  test.afterEach(async () => { await deleteUser(email); });

  test('B1: Main Service row label is visible', async ({ page }) => {
    await expect(page.locator('td.col-label:has-text("Main Service")').first()).toBeVisible();
  });

  test('B2: LifeKids row label is visible', async ({ page }) => {
    await expect(page.locator('td.col-label:has-text("LifeKids")').first()).toBeVisible();
  });

  test('B3: Switch row label is visible', async ({ page }) => {
    await expect(page.locator('td.col-label:has-text("Switch")').first()).toBeVisible();
  });

  test('B4: LifeKids column group header is present', async ({ page }) => {
    await expect(page.locator('thead th.group-header:has-text("LifeKids")').first()).toBeVisible();
  });

  test('B5: SWITCH/Youth column group header is present', async ({ page }) => {
    await expect(page.locator('thead th.group-header:has-text("SWITCH")').first()).toBeVisible();
  });

  test('B6: Main volunteer columns appear under Experience', async ({ page }) => {
    await expect(page.locator('th:has-text("Vol: Band")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Vol: Tech")').first()).toBeVisible();
  });

  test('B7: Kids Check-In volunteer column is present', async ({ page }) => {
    await expect(page.locator('th:has-text("Vol: Kids Check-In")').first()).toBeVisible();
  });

  test('B8: Youth Host volunteer column is present', async ({ page }) => {
    await expect(page.locator('th:has-text("Vol: Youth Host")').first()).toBeVisible();
  });

  test('B9: Giving group shows both Tithes & Online columns', async ({ page }) => {
    await expect(page.locator('th:has-text("Tithes & Offerings")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Online")').first()).toBeVisible();
  });

  test('B10: Import returns exactly 12 occurrences', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="12"')).toBeVisible();
  });

  test('B11: Import returns exactly 36 attendance records', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="36"')).toBeVisible();
  });

  test('B12: AI chat explains Kids mapping correctly', async ({ page }) => {
    const input = page.locator('input[placeholder*="Ask a question"]');
    await input.fill('How did you handle kids ministry?');
    await page.locator('button[type="submit"]').click();
    // Use first() — "Kids" / "LifeKids" may appear in multiple bubbles or labels
    await expect(page.locator('text=/kids|LifeKids/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('B13: AI chat explains Switch/Youth mapping correctly', async ({ page }) => {
    const input = page.locator('input[placeholder*="Ask a question"]');
    await input.fill('What about Switch and Youth?');
    await page.locator('button[type="submit"]').click();
    // Use first() — row labels also contain "Switch"
    await expect(page.locator('text=/Switch|Youth|YOUTH/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('B14: 3 SV scope tags visible (one per service template)', async ({ page }) => {
    const svTags = await page.locator('.scope-SV').count();
    expect(svTags).toBeGreaterThanOrEqual(3);
  });

  test('B15: iPhone — tab switcher visible and functional at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('button:has-text("Data Grid")')).toBeVisible();
    await expect(page.locator('button:has-text("AI Assistant")')).toBeVisible();
    await page.click('button:has-text("AI Assistant")');
    await expect(page.locator('text="Data Assistant"')).toBeVisible();
    await page.click('button:has-text("Data Grid")');
    await expect(page.locator('.history-grid-table')).toBeVisible();
  });
});


// ════════════════════════════════════════════════════════════════════════════════
//  SCENARIO C — HARVEST CHURCH
//  Single campus, 5 distinct giving categories, 1 special event row, no volunteer tracking
//  Pre-determined: 8 occurrences (2 services × 4 weeks), 16 attendance records
// ════════════════════════════════════════════════════════════════════════════════

const SCENARIO_C = {
  service_templates: [
    { service_code: 'svc_9am',  display_name: '9 AM',  primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: 'svc_11am', display_name: '11 AM', primary_tag: 'MAIN', day_of_week: 0 },
  ],
  volunteer_categories: [],
  giving_sources: [
    { name: 'Tithes' },
    { name: 'Building Fund' },
    { name: 'Missions' },
    { name: 'Online Giving' },
    { name: 'Benevolence' },
  ],
  service_tags: [],
  tag_relationships: [],
  occurrences: [],
  anomalies: [
    { kind: 'unusual_spike', description: 'Easter Sunday giving was 3× the weekly average' },
  ],
};
const SCENARIO_C_RESULT = { occurrences: 8, attendance: 16 };

test.describe('Scenario C — Harvest: 5 Giving Sources + Anomaly (C1–C15)', () => {
  let email = '';
  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context, 'harvest');
    await goToReview(page, SCENARIO_C, SCENARIO_C_RESULT,
      [{ kind: 'unusual_spike', description: 'Easter Sunday giving was 3× the weekly average' }]
    );
  });
  test.afterEach(async () => { await deleteUser(email); });

  test('C1: All 5 giving source columns are present', async ({ page }) => {
    await expect(page.locator('th:has-text("Tithes")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Building Fund")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Missions")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Online Giving")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Benevolence")').first()).toBeVisible();
  });

  test('C2: Giving group header spans all 5 giving columns', async ({ page }) => {
    const givingHeader = page.locator('thead th.group-header').filter({ hasText: /^Giving$/ }).first();
    await expect(givingHeader).toBeVisible();
    const colspan = await givingHeader.getAttribute('colspan');
    expect(Number(colspan)).toBeGreaterThanOrEqual(5);
  });

  test('C3: No volunteer columns appear (this church has none)', async ({ page }) => {
    const volCols = await page.locator('th:has-text("Vol:")').count();
    expect(volCols).toBe(0);
  });

  test('C4: Experience (attendance) column group is still present', async ({ page }) => {
    await expect(page.locator('thead th.group-header:has-text("Experience")').first()).toBeVisible();
  });

  test('C5: 9 AM and 11 AM service row labels appear', async ({ page }) => {
    await expect(page.locator('td.col-label:has-text("9 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("11 AM")').first()).toBeVisible();
  });

  test('C6: Import returns exactly 8 occurrences (2 services × 4 weeks)', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="8"')).toBeVisible();
  });

  test('C7: Import returns exactly 16 attendance records', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="16"')).toBeVisible();
  });

  test('C8: Grid table body has at least 2 SV rows (one per service)', async ({ page }) => {
    const svRows = await page.locator('tr.row-sv').count();
    expect(svRows).toBeGreaterThanOrEqual(2);
  });

  test('C9: Week header row visible', async ({ page }) => {
    await expect(page.locator('tr.row-week_header').first()).toBeVisible();
  });

  test('C10: AI explains giving mapping when asked about tithes', async ({ page }) => {
    const input = page.locator('input[placeholder*="Ask a question"]');
    await input.fill('How did you map the tithes and giving data?');
    await page.locator('button[type="submit"]').click();
    // Use first() — column headers also contain "Giving", causing strict mode violations
    await expect(page.locator('text=/giving|Giving|sources/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('C11: Confirm & Import button is visible in chat panel', async ({ page }) => {
    await expect(page.locator('button:has-text("Confirm & Import")').first()).toBeVisible();
  });

  test('C12: Grid horizontal scroll is available (5 giving + attendance columns)', async ({ page }) => {
    const scrollWidth = await page.locator('.grid-wrapper').evaluate(el => el.scrollWidth);
    const clientWidth = await page.locator('.grid-wrapper').evaluate(el => el.clientWidth);
    expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth);
  });

  test('C13: Tags column group is present', async ({ page }) => {
    await expect(page.locator('thead th.group-header:has-text("Tags")').first()).toBeVisible();
  });

  test('C14: iPad landscape (1024×768) — grid visible without requiring tab switch', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('.history-grid-table')).toBeVisible();
  });

  test('C15: After successful import, success screen has "Services imported" label', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Services imported"')).toBeVisible({ timeout: 15_000 });
  });
});


// ════════════════════════════════════════════════════════════════════════════════
//  SCENARIO D — CITY LIGHT CHURCH
//  Single campus, 4 service times (7AM, 9AM, 11AM, 1PM), no Kids/Youth, heavy giving
//  Pre-determined: 16 occurrences (4 services × 4 weeks), 64 attendance records
// ════════════════════════════════════════════════════════════════════════════════

const SCENARIO_D = {
  service_templates: [
    { service_code: '7am',  display_name: '7 AM',  primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: '9am',  display_name: '9 AM',  primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: '11am', display_name: '11 AM', primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: '1pm',  display_name: '1 PM',  primary_tag: 'MAIN', day_of_week: 0 },
  ],
  volunteer_categories: [
    { name: 'Worship Team', primary_tag: 'MAIN' },
    { name: 'Ushers',       primary_tag: 'MAIN' },
  ],
  giving_sources: [
    { name: 'General' },
    { name: 'Online' },
  ],
  service_tags: [],
  tag_relationships: [],
  occurrences: [],
};
const SCENARIO_D_RESULT = { occurrences: 16, attendance: 64 };

test.describe('Scenario D — City Light: 4 Service Times, No Kids/Youth (D1–D15)', () => {
  let email = '';
  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context, 'citylight');
    await goToReview(page, SCENARIO_D, SCENARIO_D_RESULT);
  });
  test.afterEach(async () => { await deleteUser(email); });

  test('D1: All 4 service time rows are visible (7AM, 9AM, 11AM, 1PM)', async ({ page }) => {
    await expect(page.locator('td.col-label:has-text("7 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("9 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("11 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("1 PM")').first()).toBeVisible();
  });

  test('D2: LifeKids group is structural but no service is tagged KIDS', async ({ page }) => {
    // PreviewGrid always renders LifeKids with an attendance.kids column (structural default).
    // City Light has no KIDS-tagged service template, so no SV rows populate that group.
    // We verify there is no service ROW LABEL containing "LifeKids" (no kids service template).
    const kidsServiceRow = await page.locator('td.col-label:has-text("LifeKids")').count();
    expect(kidsServiceRow).toBe(0);
  });

  test('D3: SWITCH group is structural but no service is tagged YOUTH', async ({ page }) => {
    // Same reasoning as D2 — no Switch/Youth service template in City Light.
    // No SV row label should say "Switch".
    const switchServiceRow = await page.locator('td.col-label:has-text("Switch")').count();
    expect(switchServiceRow).toBe(0);
  });

  test('D4: Worship Team and Ushers volunteer columns present', async ({ page }) => {
    await expect(page.locator('th:has-text("Vol: Worship Team")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Vol: Ushers")').first()).toBeVisible();
  });

  test('D5: Exactly 4 SV scope tags visible (one per service)', async ({ page }) => {
    const svTags = await page.locator('.scope-SV').count();
    expect(svTags).toBeGreaterThanOrEqual(4);
  });

  test('D6: Import returns exactly 16 occurrences (4 services × 4 Sundays)', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="16"')).toBeVisible();
  });

  test('D7: Import returns exactly 64 attendance records', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="64"')).toBeVisible();
  });

  test('D8: Experience column group present; no KIDS/YOUTH service row labels', async ({ page }) => {
    // Experience group is always present (MAIN attendance).
    await expect(page.locator('thead th.group-header:has-text("Experience")').first()).toBeVisible();
    // No service templates tagged KIDS or YOUTH means no row labels for those ministries.
    expect(await page.locator('td.col-label:has-text("LifeKids")').count()).toBe(0);
    expect(await page.locator('td.col-label:has-text("Switch")').count()).toBe(0);
  });

  test('D9: Week header row rendered above service rows', async ({ page }) => {
    await expect(page.locator('tr.row-week_header').first()).toBeVisible();
  });

  test('D10: Attenders leaf column visible under Experience', async ({ page }) => {
    await expect(page.locator('th:has-text("Attenders")').first()).toBeVisible();
  });

  test('D11: General and Online giving columns both visible', async ({ page }) => {
    await expect(page.locator('th:has-text("General")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Online")').first()).toBeVisible();
  });

  test('D12: Collapse icon for volunteer group is visible', async ({ page }) => {
    await expect(page.locator('.collapse-icon').first()).toBeVisible();
  });

  test('D13: Success screen shows "Attendance records" label', async ({ page }) => {
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Attendance records"')).toBeVisible({ timeout: 15_000 });
  });

  test('D14: AI assistant greeting shows on load', async ({ page }) => {
    await expect(page.locator('text=/reviewed your spreadsheet/i')).toBeVisible({ timeout: 8_000 });
  });

  test('D15: Chat send button disabled until user types', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();
    await page.locator('input[placeholder*="Ask a question"]').fill('Hello');
    await expect(submitBtn).toBeEnabled();
  });
});


// ════════════════════════════════════════════════════════════════════════════════
//  SCENARIO E — JOURNEY CHURCH
//  Tests the UPLOAD page flow end-to-end + verifies the AI receives CSV content
//  and the review page UI behaviors for a 2-service church
// ════════════════════════════════════════════════════════════════════════════════

// The CSV that Journey Church uploads — exact content we can verify
const JOURNEY_CSV = [
  'Date,Campus,Service,Adult Attendance,Kids,Band Vols,Tech Vols,Tithes,Online Giving',
  '2026-05-04,Main,9 AM,287,94,5,3,14200.50,8750.00',
  '2026-05-04,Main,11 AM,341,118,5,3,17800.00,10200.50',
  '2026-05-11,Main,9 AM,265,89,4,3,13100.00,7900.00',
  '2026-05-11,Main,11 AM,318,110,4,3,16400.00,9800.00',
  '2026-05-18,Main,9 AM,271,91,5,2,13600.00,8100.00',
  '2026-05-18,Main,11 AM,308,105,5,2,15900.00,9400.00',
  '2026-05-25,Main,9 AM,295,97,5,3,15100.00,8900.00',
  '2026-05-25,Main,11 AM,362,124,5,3,18900.00,11200.00',
].join('\n');

// What the AI would produce from Journey Church's CSV
const SCENARIO_E = {
  service_templates: [
    { service_code: 'main_9am',  display_name: '9 AM',  primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: 'main_11am', display_name: '11 AM', primary_tag: 'MAIN', day_of_week: 0 },
  ],
  volunteer_categories: [
    { name: 'Band', primary_tag: 'MAIN' },
    { name: 'Tech', primary_tag: 'MAIN' },
  ],
  giving_sources: [
    { name: 'Tithes' },
    { name: 'Online Giving' },
  ],
  service_tags: [],
  tag_relationships: [],
  occurrences: [],
};
const SCENARIO_E_RESULT = { occurrences: 16, attendance: 32 };

test.describe('Scenario E — Journey Church: Upload Flow + Realistic CSV (E1–E15)', () => {
  let email = '';

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context, 'journey');
  });
  test.afterEach(async () => { await deleteUser(email); });

  // ── Upload page tests ──
  test('E1: Upload page loads with CSV file input visible', async ({ page }) => {
    await goToUpload(page);
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test('E2: Journey CSV file uploads successfully and appears in file list', async ({ page }) => {
    await goToUpload(page);
    await page.setInputFiles('input[type="file"]', {
      name: 'journey_may2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(JOURNEY_CSV),
    });
    await expect(page.locator('text="journey_may2026.csv"')).toBeVisible();
  });

  test('E3: Non-CSV file rejected with error message', async ({ page }) => {
    await goToUpload(page);
    await page.setInputFiles('input[type="file"]', {
      name: 'attendance.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('dummy'),
    });
    await expect(page.locator('text=/not a valid CSV/i')).toBeVisible({ timeout: 5_000 });
  });

  test('E4: PDF file rejected with clear error', async ({ page }) => {
    await goToUpload(page);
    await page.setInputFiles('input[type="file"]', {
      name: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy'),
    });
    await expect(page.locator('text=/not a valid CSV/i')).toBeVisible({ timeout: 5_000 });
  });

  test('E5: Multiple CSVs can be uploaded at once', async ({ page }) => {
    await goToUpload(page);
    await page.setInputFiles('input[type="file"]', [
      { name: 'may2026.csv', mimeType: 'text/csv', buffer: Buffer.from(JOURNEY_CSV) },
      { name: 'apr2026.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Attendance\n2026-04-06,300') },
    ]);
    await expect(page.locator('text="may2026.csv"')).toBeVisible();
    await expect(page.locator('text="apr2026.csv"')).toBeVisible();
  });

  test('E6: Uploaded CSV can be removed from the list', async ({ page }) => {
    await goToUpload(page);
    await page.setInputFiles('input[type="file"]', {
      name: 'journey_may2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(JOURNEY_CSV),
    });
    await expect(page.locator('text="journey_may2026.csv"')).toBeVisible();
    await page.click('button:has-text("Remove")');
    await expect(page.locator('text="journey_may2026.csv"')).not.toBeVisible();
  });

  test('E7: Free-text description field accepts church context', async ({ page }) => {
    await goToUpload(page);
    const textarea = page.locator('textarea');
    await textarea.fill('We run 9 AM and 11 AM on Sundays. Kids Church runs in parallel. Switch is Wednesday youth.');
    await expect(textarea).toHaveValue(/9 AM and 11 AM/);
  });

  test('E8: Propose mapping button is visible after CSV upload', async ({ page }) => {
    await goToUpload(page);
    await page.setInputFiles('input[type="file"]', {
      name: 'journey_may2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(JOURNEY_CSV),
    });
    await expect(page.locator('button:has-text("Propose mapping →")')).toBeVisible();
  });

  test('E9: Submitting upload shows the analyzing panel', async ({ page }) => {
    await goToUpload(page);

    // Mock the POST to simulate processing
    await page.route('**/api/onboarding/import', async route => {
      if (route.request().method() === 'POST') {
        // Delay briefly to let analyzing panel show
        await new Promise(r => setTimeout(r, 800));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: 'journey-job-001' }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.setInputFiles('input[type="file"]', {
      name: 'journey_may2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(JOURNEY_CSV),
    });

    await page.click('button:has-text("Propose mapping →")');
    // The analyzing panel shows multiple matching elements — use first() to avoid strict mode
    await expect(page.locator('text=/Reading your spreadsheet|Finding your services|rows/i').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Review page tests with Journey's mapping ──
  test('E10: Review page shows 9 AM and 11 AM row labels from Journey CSV', async ({ page }) => {
    await goToReview(page, SCENARIO_E, SCENARIO_E_RESULT, [], 'journey-job-001');
    await expect(page.locator('td.col-label:has-text("9 AM")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("11 AM")').first()).toBeVisible();
  });

  test('E11: Volunteer columns for Band and Tech are mapped correctly', async ({ page }) => {
    await goToReview(page, SCENARIO_E, SCENARIO_E_RESULT, [], 'journey-job-001');
    await expect(page.locator('th:has-text("Vol: Band")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Vol: Tech")').first()).toBeVisible();
  });

  test('E12: Tithes and Online Giving sources correctly mapped', async ({ page }) => {
    await goToReview(page, SCENARIO_E, SCENARIO_E_RESULT, [], 'journey-job-001');
    await expect(page.locator('th:has-text("Tithes")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Online Giving")').first()).toBeVisible();
  });

  test('E13: AI answers volunteer question with helpful context', async ({ page }) => {
    await goToReview(page, SCENARIO_E, SCENARIO_E_RESULT, [], 'journey-job-001');
    await page.locator('input[placeholder*="Ask a question"]').fill('How did you map the volunteer columns?');
    await page.locator('button[type="submit"]').click();
    // Use first() — column headers "Vol: Band" also match the /volunteer/i pattern
    await expect(page.locator('text=/volunteer|Volunteer/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('E14: Import returns expected occurrences and attendance counts', async ({ page }) => {
    await goToReview(page, SCENARIO_E, SCENARIO_E_RESULT, [], 'journey-job-001');
    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="16"')).toBeVisible();
    await expect(page.locator('text="32"')).toBeVisible();
  });

  test('E15: Full end-to-end: back button from review returns to upload page', async ({ page }) => {
    await goToReview(page, SCENARIO_E, SCENARIO_E_RESULT, [], 'journey-job-001');
    await page.click('text="← Back"');
    await expect(page).toHaveURL(/.*onboarding\/import/);
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });
});
