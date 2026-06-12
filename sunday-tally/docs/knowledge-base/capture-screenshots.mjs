/**
 * Screenshot capture script for What We Track visual guide.
 * Run with: node docs/knowledge-base/capture-screenshots.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:3000';
const EMAIL = 'demochurch@example.com';
const PASSWORD = 'DemoChurch2026!';

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function save(page, filename) {
  const fullPath = join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: fullPath, fullPage: false, type: 'png' });
  console.log(`✓ ${filename}`);
}

// Click a ministry row in the track panel by its name
async function clickMinistry(page, name) {
  // The clickable rows are div.cursor-pointer containing the ministry name
  await page.evaluate((ministryName) => {
    const divs = Array.from(document.querySelectorAll('div.cursor-pointer'));
    const target = divs.find(d => {
      const spans = d.querySelectorAll('span');
      return Array.from(spans).some(s => s.textContent.trim() === ministryName);
    });
    if (target) target.click();
    else throw new Error(`Ministry row not found: ${ministryName}`);
  }, name);
  await page.waitForTimeout(800);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // ── Login ─────────────────────────────────────────────────────────────────
  console.log('Logging in...');
  await page.goto(`${BASE_URL}/auth/login`);
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/auth/login'), { timeout: 20000 });
  await page.waitForTimeout(2000);
  console.log('Logged in. URL:', page.url());

  // ── Navigate to What we track tab ─────────────────────────────────────────
  await page.goto(`${BASE_URL}/settings/setup?tab=track`);
  await page.waitForTimeout(1500);

  // Click "What we track" tab button
  await page.locator('button', { hasText: 'What we track' }).click();
  await page.waitForTimeout(800);

  // Wait for the ministry tree to load (unique "Add ministry or group" button)
  await page.locator('button', { hasText: 'Add ministry or group' }).waitFor({ timeout: 10000 });
  console.log('What we track tab loaded.');

  // ── Screenshot 01: Overview — full tree, no selection ─────────────────────
  await save(page, '01-overview.png');

  // ── Screenshot 02: "Add ministry or group" button (hovered) ───────────────
  await page.locator('button', { hasText: 'Add ministry or group' }).hover();
  await page.waitForTimeout(600);
  await save(page, '02-add-ministry-button.png');

  // ── Screenshot 03: Experience selected — detail panel ─────────────────────
  await clickMinistry(page, 'Experience');
  await save(page, '03-experience-selected.png');

  // ── Screenshot 04: "Add a group inside" button visible ────────────────────
  // Scroll the right detail panel to the bottom to show "Add a group inside"
  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('[class*="overflow-y-auto"]'));
    panels.forEach(p => { p.scrollTop = p.scrollHeight; });
  });
  await page.waitForTimeout(500);
  await save(page, '04-add-group-button.png');

  // Scroll back to top
  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('[class*="overflow-y-auto"]'));
    panels.forEach(p => { p.scrollTop = 0; });
  });
  await page.waitForTimeout(300);

  // ── Screenshot 05: "Add a count" button visible ───────────────────────────
  // The add-count button should be visible in the detail panel
  try {
    const addCountBtn = page.locator('button', { hasText: 'Add a count' }).first();
    await addCountBtn.waitFor({ timeout: 5000 });
    await addCountBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await save(page, '05-add-count-button.png');
  } catch {
    console.log('05: Scrolling to find Add a count button...');
    await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('[class*="overflow-y-auto"]'));
      panels.forEach(p => { p.scrollTop = p.scrollHeight / 2; });
    });
    await page.waitForTimeout(400);
    await save(page, '05-add-count-button.png');
  }

  // ── Screenshot 06: Add a count form expanded ──────────────────────────────
  try {
    const addCountBtn = page.locator('button', { hasText: 'Add a count' }).first();
    await addCountBtn.scrollIntoViewIfNeeded();
    await addCountBtn.click();
    await page.waitForTimeout(800);
    await save(page, '06-add-count-form.png');
    // Close the form
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch (e) {
    console.log('06: Could not expand form:', e.message);
    await save(page, '06-add-count-form.png');
  }

  // ── Screenshot 07: Entry vs Roll-up toggle ────────────────────────────────
  // Navigate back to top of detail panel to show metric rows
  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('[class*="overflow-y-auto"]'));
    panels.forEach(p => { p.scrollTop = 0; });
  });
  await page.waitForTimeout(300);
  try {
    const entryBtn = page.locator('button', { hasText: 'Entry' }).first();
    await entryBtn.waitFor({ timeout: 5000 });
    await entryBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await save(page, '07-entry-rollup-toggle.png');
  } catch {
    console.log('07: Entry button not found, saving current state');
    await save(page, '07-entry-rollup-toggle.png');
  }

  // ── Screenshot 08: Roll-up mode activated ────────────────────────────────
  try {
    const rollupBtn = page.locator('button', { hasText: /Roll.up/i }).first();
    await rollupBtn.waitFor({ timeout: 5000 });
    await rollupBtn.click();
    await page.waitForTimeout(700);
    await save(page, '08-rollup-expanded.png');
    // Restore Entry mode
    await page.locator('button', { hasText: 'Entry' }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  } catch {
    console.log('08: Roll-up button not found, saving current state');
    await save(page, '08-rollup-expanded.png');
  }

  // ── Screenshot 09: Giving node selected ──────────────────────────────────
  await clickMinistry(page, 'Giving');
  await save(page, '09-giving-selected.png');

  // ── Screenshot 10: Weekly · church-wide badge ─────────────────────────────
  // Scroll to see the Weekly badge in the Giving detail panel
  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('[class*="overflow-y-auto"]'));
    panels.forEach(p => { p.scrollTop = 0; });
  });
  await page.waitForTimeout(400);
  await save(page, '10-weekly-churchwide-badge.png');

  await browser.close();
  console.log('\nAll screenshots saved to:', SCREENSHOTS_DIR);
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
