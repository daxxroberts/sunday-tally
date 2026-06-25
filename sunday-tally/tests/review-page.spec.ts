/**
 * review-page.spec.ts
 *
 * 25 focused browser tests for the Import Review page.
 * Every test that touches the review page uses a rich, realistic mock
 * that mirrors what the real AI extraction produces, so we can actually
 * SEE data rendered in the grid rather than empty cells.
 *
 * Coverage areas:
 *   R1–R5   Grid renders correctly (columns, rows, hierarchy)
 *   R6–R8   Header visual hierarchy (group vs leaf)
 *   R9–R12  Specific data values visible in grid cells
 *   R13–R15 Volunteer & giving column rendering
 *   R16–R18 Mobile / tablet pane switcher
 *   R19–R21 AI chat pane interaction
 *   R22–R25 Import flow (confirm, error, success, redirect)
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// ── Supabase admin client for user creation / teardown ────────────────────────
const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY';
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginNewUser(page: Page, context: BrowserContext): Promise<string> {
  const ts = Date.now();
  const email = `review.test.${ts}@sundaytally.test`;
  const pass = 'TestPass123!';
  await page.goto('/signup');
  await page.fill('[id="churchName"]', `Review Test Church ${ts}`);
  await page.fill('[id="ownerName"]', 'Pastor Test');
  await page.fill('[id="email"]', email);
  await page.fill('[id="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(services|onboarding)/, { timeout: 30_000 });
  return email;
}

async function deleteUser(email: string) {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find(u => u.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}

/**
 * The canonical "rich" mock that every grid test should use.
 * Mirrors a realistic Sunday CSV with 2 services, volunteers, and giving.
 */
const RICH_PROPOSED_SETUP = {
  service_templates: [
    { service_code: '9am',  display_name: '9 AM Service',  primary_tag: 'MAIN', day_of_week: 0 },
    { service_code: '11am', display_name: '11 AM Service', primary_tag: 'MAIN', day_of_week: 0 },
  ],
  volunteer_categories: [
    { name: 'Band',          primary_tag: 'MAIN' },
    { name: 'Tech',          primary_tag: 'MAIN' },
    { name: 'Guest Service', primary_tag: 'MAIN' },
  ],
  giving_sources: [
    { name: 'General Offering' },
    { name: 'Online Giving' },
  ],
  service_tags: [],
  tag_relationships: [],
  occurrences: [
    { date: '2026-05-03', service_code: '9am',  attendance: 245 },
    { date: '2026-05-03', service_code: '11am', attendance: 310 },
    { date: '2026-05-10', service_code: '9am',  attendance: 260 },
    { date: '2026-05-10', service_code: '11am', attendance: 325 },
    { date: '2026-05-17', service_code: '9am',  attendance: 240 },
    { date: '2026-05-17', service_code: '11am', attendance: 295 },
  ],
};

const RICH_MOCK_RESPONSE = {
  job: {
    proposed_mapping: {
      sources: [{ kind: 'csv', name: 'church_data.csv' }],
      proposed_setup: RICH_PROPOSED_SETUP,
    },
    anomalies: [],
  },
};

/** Sets up the GET mock and navigates to the review page */
async function goToReviewPage(page: Page, jobId = 'rich-mock-job') {
  let resolvedSetup = RICH_PROPOSED_SETUP as any;
  if (resolvedSetup && (!resolvedSetup.metrics || !resolvedSetup.ministry_tags)) {
    const ministry_tags = (resolvedSetup.service_tags || []).map((t: any) => {
      let role = 'OTHER';
      if (t.tag_code === 'MAIN') role = 'ADULT_SERVICE';
      else if (t.tag_code === 'KIDS') role = 'KIDS_MINISTRY';
      else if (t.tag_code === 'YOUTH') role = 'YOUTH_MINISTRY';
      return {
        code: t.tag_code,
        name: t.tag_name,
        tag_role: role
      };
    });

    if (ministry_tags.length === 0) {
      ministry_tags.push({ code: 'MAIN', name: 'Experience', tag_role: 'ADULT_SERVICE' });
    }

    const metrics: any[] = [];

    // Add attendance metrics
    ministry_tags.forEach((t: any) => {
      if (t.tag_role !== 'OTHER') {
        metrics.push({
          metric_code: `att_${t.code.toLowerCase()}`,
          name: 'Attenders',
          ministry_tag: t.code,
          reporting_tag: 'ATTENDANCE'
        });
      }
    });

    // Add volunteers
    (resolvedSetup.volunteer_categories || []).forEach((v: any) => {
      metrics.push({
        metric_code: `vol_${v.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: v.name,
        ministry_tag: v.primary_tag || 'MAIN',
        reporting_tag: 'VOLUNTEERS'
      });
    });

    // Add giving
    (resolvedSetup.giving_sources || []).forEach((g: any) => {
      metrics.push({
        metric_code: `giving_${g.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: g.name,
        ministry_tag: 'MAIN',
        reporting_tag: 'GIVING'
      });
    });

    resolvedSetup = {
      ...resolvedSetup,
      ministry_tags,
      metrics
    };
  }

  await page.route('**/api/onboarding/import*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job: {
            proposed_mapping: {
              sources: [{ kind: 'csv', name: 'church_data.csv' }],
              proposed_setup: resolvedSetup,
            },
            anomalies: [],
          },
        }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/onboarding/chat', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: '0:"Got it! I\'ve updated the mapping."\n',
    });
  });

  await page.goto(`/onboarding/import/review?job_id=${jobId}`);
  // Wait for the grid to fully appear (loading spinner gone)
  await page.waitForSelector('.history-grid-table', { timeout: 15_000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1: Grid renders correctly (R1–R5)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('R1–R5: Grid renders correctly', () => {
  let email = '';

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context);
    await goToReviewPage(page);
  });

  test.afterEach(async () => { await deleteUser(email); });

  test('R1: Grid table is present in the DOM', async ({ page }) => {
    await expect(page.locator('.history-grid-table')).toBeVisible();
  });

  test('R2: Both service template names appear in grid row labels', async ({ page }) => {
    // Service templates drive SV rows (not column headers) — look in td.col-label
    await expect(page.locator('td.col-label:has-text("9 AM Service")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("11 AM Service")').first()).toBeVisible();
  });

  test('R3: Scope column and Entry (label) column are present', async ({ page }) => {
    await expect(page.locator('th.col-scope')).toBeVisible();
    await expect(page.locator('th.col-label')).toBeVisible();
  });

  test('R4: At least one data row is rendered in the grid body', async ({ page }) => {
    // tbody should contain at least one tr
    const rowCount = await page.locator('.history-grid-table tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('R5: Grid wrapper has horizontal scroll when content overflows', async ({ page }) => {
    const overflow = await page.locator('.grid-wrapper').evaluate(
      el => window.getComputedStyle(el).overflowX
    );
    expect(['auto', 'scroll']).toContain(overflow);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2: Header visual hierarchy (R6–R8)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('R6–R8: Header visual hierarchy', () => {
  let email = '';

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context);
    await goToReviewPage(page);
  });

  test.afterEach(async () => { await deleteUser(email); });

  test('R6: Group headers (parent) have .group-header class', async ({ page }) => {
    const groupHeaders = page.locator('thead th.group-header');
    await expect(groupHeaders.first()).toBeVisible();
  });

  test('R7: Group headers are visually distinct — dark background color applied', async ({ page }) => {
    // The .group-header class sets background: #1e293b (dark slate)
    // Just verify the computed background is a dark color (not white/light gray)
    const groupBg = await page.locator('thead th.group-header').first().evaluate(
      el => window.getComputedStyle(el).backgroundColor
    );
    // rgb(30, 41, 59) = #1e293b — confirm it is NOT the default light gray
    expect(groupBg).not.toMatch(/rgb\(241|rgb\(248|rgb\(255/);
  });

  test('R8: Experience and Giving group headers are present', async ({ page }) => {
    await expect(page.locator('thead th:has-text("Experience")').first()).toBeVisible();
    // Use exact label match to avoid matching "Online Giving" which also contains "Giving"
    await expect(page.locator('thead th.group-header').filter({ hasText: /^Giving$/ }).first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3: Specific data visible in grid (R9–R12)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('R9–R12: Data visible in the grid', () => {
  let email = '';

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context);
    await goToReviewPage(page);
  });

  test.afterEach(async () => { await deleteUser(email); });

  test('R9: "Attenders" leaf column header is visible', async ({ page }) => {
    await expect(page.locator('th:has-text("Attenders")').first()).toBeVisible();
  });

  test('R10: Service row labels match service template display names', async ({ page }) => {
    await expect(page.locator('td.col-label:has-text("9 AM Service")').first()).toBeVisible();
    await expect(page.locator('td.col-label:has-text("11 AM Service")').first()).toBeVisible();
  });

  test('R11: Scope tag "SV" appears for service-level rows', async ({ page }) => {
    await expect(page.locator('.scope-SV').first()).toBeVisible();
  });

  test('R12: Week header row is rendered (row-week_header class)', async ({ page }) => {
    await expect(page.locator('tr.row-week_header').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4: Volunteer & Giving columns (R13–R15)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('R13–R15: Volunteer & Giving columns', () => {
  let email = '';

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context);
    await goToReviewPage(page);
  });

  test.afterEach(async () => { await deleteUser(email); });

  test('R13: Volunteer column headers appear (Band, Tech, Guest Service)', async ({ page }) => {
    await expect(page.locator('th:has-text("Band")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Tech")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Guest Service")').first()).toBeVisible();
  });

  test('R14: Giving sources appear as column headers', async ({ page }) => {
    await expect(page.locator('th:has-text("General Offering")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Online Giving")').first()).toBeVisible();
  });

  test('R15: Volunteers group is collapsible (collapse-icon present)', async ({ page }) => {
    await expect(page.locator('.collapse-icon').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5: Mobile / tablet pane switcher (R16–R18)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('R16–R18: Mobile pane switcher', () => {
  let email = '';

  test.use({ viewport: { width: 768, height: 1024 } }); // iPad size

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context);
    await goToReviewPage(page);
  });

  test.afterEach(async () => { await deleteUser(email); });

  test('R16: "Data Grid" and "AI Assistant" tab buttons are visible on iPad', async ({ page }) => {
    await expect(page.locator('button:has-text("Data Grid")')).toBeVisible();
    await expect(page.locator('button:has-text("AI Assistant")')).toBeVisible();
  });

  test('R17: Switching to AI Assistant tab shows the chat pane', async ({ page }) => {
    await page.click('button:has-text("AI Assistant")');
    await expect(page.locator('text="Data Assistant"')).toBeVisible();
  });

  test('R18: Switching back to Data Grid shows the grid table', async ({ page }) => {
    await page.click('button:has-text("AI Assistant")');
    await page.click('button:has-text("Data Grid")');
    await expect(page.locator('.history-grid-table')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 6: AI Chat pane (R19–R21)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('R19–R21: AI Chat pane', () => {
  let email = '';

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context);
    await goToReviewPage(page);
  });

  test.afterEach(async () => { await deleteUser(email); });

  test('R19: Assistant greeting is shown on load', async ({ page }) => {
    await expect(
      page.locator('text=/mapping your spreadsheet/i')
    ).toBeVisible({ timeout: 8_000 });
  });

  test('R20: Chat input and send button are present', async ({ page }) => {
    await expect(
      page.locator('input[placeholder*="Ask a question"]')
    ).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('R21: Send button is disabled when input is empty', async ({ page }) => {
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 7: Import flow (R22–R25)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('R22–R25: Import flow', () => {
  let email = '';

  test.beforeEach(async ({ page, context }) => {
    email = await loginNewUser(page, context);
    await goToReviewPage(page);
  });

  test.afterEach(async () => { await deleteUser(email); });

  test('R22: "Confirm & Import" button is present and enabled', async ({ page }) => {
    const btn = page.locator('button:has-text("Confirm & Import")');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('R23: Successful import shows the success screen with stats', async ({ page }) => {
    await page.route('**/api/onboarding/import*', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: { rowsInserted: { occurrences: 24, attendance: 48 } },
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text="24"')).toBeVisible();
    await expect(page.locator('text="48"')).toBeVisible();
  });

  test('R24: Failed import shows error message inline', async ({ page }) => {
    await page.route('**/api/onboarding/import*', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'DB constraint violation' }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="DB constraint violation"')).toBeVisible({ timeout: 15_000 });
    // Grid should still be visible — user can retry
    await expect(page.locator('.history-grid-table')).toBeVisible();
  });

  test('R25: After success, "Go to your dashboard" button navigates to /dashboard', async ({ page }) => {
    await page.route('**/api/onboarding/import*', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: { rowsInserted: { occurrences: 10, attendance: 20 } } }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.click('button:has-text("Confirm & Import")');
    await expect(page.locator('text="Your data has been imported"')).toBeVisible({ timeout: 15_000 });
    await page.click('text="Go to your dashboard →"');
    await expect(page).toHaveURL(/.*dashboard/);
  });
});
