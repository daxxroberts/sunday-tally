/**
 * track-setup-2026-06.spec.ts
 *
 * Browser tests for the 2026-06 "recipe / inheritance" setup changes:
 *   1. Service setup steers toward reusing ONE ministry across service times
 *      ("Which ministry is this service part of?" + combine copy).
 *   2. "What we track" leads with "Add a ministry" (top-level), and the
 *      drag-to-move / "Move under…" machinery is gone.
 *   3. A new group inside a container inherits ALL the parent's roll-ups
 *      (Life Groups → Attendance + Dinner + Lunch), wired to total.
 *   4. You cannot turn a counted ministry WITH history into a container
 *      (Experience has logged data → "Add a group inside" is blocked).
 *
 * Runs against the Demo Church (demochurch@example.com) on a local dev server.
 * Any group created during a test is cleaned up via the admin client.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// ── Admin client (service role) — same project as church-scenarios.spec.ts ───
const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY';
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const DEMO_EMAIL = 'demochurch@example.com';
const DEMO_PASSWORD = 'DemoChurch2026!';

let demoChurchId = '';

test.beforeAll(async () => {
  const { data } = await admin.from('churches').select('id').eq('name', 'Demo Church').single();
  demoChurchId = (data?.id as string) ?? '';
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function loginDemo(page: Page) {
  await page.goto('/auth/login');
  await page.waitForSelector('#email', { timeout: 15_000 });
  await page.fill('#email', DEMO_EMAIL);
  const pwTab = page.locator('button:has-text("Password")');
  if (await pwTab.isVisible().catch(() => false)) { await pwTab.click(); await page.waitForTimeout(200); }
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.toString().includes('/auth/login'), { timeout: 20_000 });
}

async function gotoTrack(page: Page) {
  await page.goto('/settings/setup?tab=track');
  // Anchor on the unique primary button (the tree's "Life Groups" text appears
  // in multiple places, which makes it an ambiguous wait target).
  await page.waitForSelector('button:has-text("Add a ministry")', { timeout: 20_000 });
  await page.waitForTimeout(800); // let the tree finish hydrating
}

/** Click a ministry row by exact name (rows are div.cursor-pointer with a name span). */
async function selectMinistry(page: Page, name: string) {
  await page.evaluate((n) => {
    const divs = Array.from(document.querySelectorAll('div.cursor-pointer'));
    const target = divs.find(d =>
      Array.from(d.querySelectorAll('span')).some(s => s.textContent?.trim() === n));
    if (!target) throw new Error(`Ministry row not found: ${n}`);
    (target as HTMLElement).click();
  }, name);
  await page.waitForTimeout(600);
}

/** Remove a test-created group (its links, metrics, then the tag). */
async function deleteGroupByName(name: string) {
  if (!demoChurchId) return;
  const { data: tags } = await admin
    .from('service_tags').select('id').eq('church_id', demoChurchId).eq('name', name);
  for (const t of (tags ?? []) as { id: string }[]) {
    await admin.from('service_template_tags').delete().eq('ministry_tag_id', t.id);
    await admin.from('metrics').delete().eq('ministry_tag_id', t.id);
    await admin.from('service_tags').delete().eq('id', t.id);
  }
}

// ════════════════════════════════════════════════════════════════════════════
test.describe('Setup copy & structure', () => {
  test('S1: service setup asks which ministry, and explains combining', async ({ page }) => {
    await loginDemo(page);
    await page.goto('/settings/services/new');
    await expect(page.locator('text=Which ministry is this service part of?')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=/add up together on your dashboard/i')).toBeVisible();
  });

  test('S2: track leads with "Add a ministry" and has no drag/move controls', async ({ page }) => {
    await loginDemo(page);
    await gotoTrack(page);
    await expect(page.locator('button:has-text("Add a ministry")')).toBeVisible();
    await expect(page.locator('text=Add ministry or group')).toHaveCount(0);
    await expect(page.locator('[aria-label="Drag to move"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Move under…"]')).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe('Subgroup inheritance & leaf-parent guard', () => {
  test('I1: a new group under Life Groups inherits Attendance + Dinner + Lunch', async ({ page }) => {
    const groupName = `ZZInherit ${Date.now()}`;
    await loginDemo(page);
    await gotoTrack(page);
    await selectMinistry(page, 'Life Groups');
    await page.click('button:has-text("Add a group inside Life Groups")');
    const input = page.locator('input[placeholder*="Group name"]');
    await input.fill(groupName);
    await input.press('Enter');
    await page.waitForTimeout(2000);

    try {
      // The new child is auto-selected and visible in the tree/detail.
      await expect(page.locator(`text=${groupName}`).first()).toBeVisible({ timeout: 10_000 });

      // Truth check: the DB should show exactly 3 wired entry metrics on the new
      // group — one per Life Groups roll-up (Attendance + Dinner + Lunch), each
      // pointing at the parent roll-up it feeds.
      const { data: tag } = await admin
        .from('service_tags').select('id').eq('church_id', demoChurchId).eq('name', groupName).single();
      const { data: metrics } = await admin
        .from('metrics')
        .select('id, mode, parent_metric_id, reporting_tag_id, reporting_tags(code)')
        .eq('ministry_tag_id', (tag?.id as string)).eq('is_active', true);
      const wired = (metrics ?? []).filter(m => m.mode === 'entry' && m.parent_metric_id);
      expect(wired.length).toBe(3);
      const kinds = (metrics ?? []).map(m => (m as { reporting_tags?: { code?: string } }).reporting_tags?.code);
      expect(kinds.filter(k => k === 'VOLUNTEERS').length).toBe(2); // Dinner + Lunch
      expect(kinds.filter(k => k === 'ATTENDANCE').length).toBe(1);
    } finally {
      await deleteGroupByName(groupName);
    }
  });

  test('I2: cannot add a group inside Experience (it has logged history)', async ({ page }) => {
    const groupName = `ZZBlocked ${Date.now()}`;
    await loginDemo(page);
    await gotoTrack(page);

    let dialogMsg = '';
    page.on('dialog', async d => { dialogMsg = d.message(); await d.dismiss(); });

    await selectMinistry(page, 'Experience');
    await page.click('button:has-text("Add a group inside Experience")');
    const input = page.locator('input[placeholder*="Group name"]');
    await input.fill(groupName);
    await input.press('Enter');
    await page.waitForTimeout(2000);

    expect(dialogMsg).toContain('already has its own numbers');
    // And nothing should have been created.
    const { data: tags } = await admin
      .from('service_tags').select('id').eq('church_id', demoChurchId).eq('name', groupName);
    expect((tags ?? []).length).toBe(0);
  });
});
