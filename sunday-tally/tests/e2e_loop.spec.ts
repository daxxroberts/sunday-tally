import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iwbrzdiubrvogiamoqvx.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3YnJ6ZGl1YnJ2b2dpYW1vcXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI2NzgzMCwiZXhwIjoyMDkxODQzODMwfQ.oRT_Sz_b6gKpw8kfG4TTSdq5Qjcd89W79m74d14OltY';
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function deleteUser(email: string) {
  const { data } = await admin.auth.admin.listUsers();
  const u = data.users.find(u => u.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}

test.describe('E2E Import Resilience Loop', () => {
  const ITERATIONS = 1; 

  for (let i = 1; i <= ITERATIONS; i++) {
    test(`Iteration ${i}: Import Flow`, async ({ page }) => {
      const ts = Date.now();
      const email = `e2eloop.test.${ts}@sundaytally.test`;
      const pass = 'TestPass123!';

      // 1. Auth Flow: Sign up
      await page.goto('http://localhost:3000/signup');
      await page.fill('[id="churchName"]', `E2E Loop Church ${ts}`);
      await page.fill('[id="ownerName"]', 'Pastor E2E');
      await page.fill('[id="email"]', email);
      await page.fill('[id="password"]', pass);
      await page.click('button[type="submit"]');

      // Wait for redirect to onboarding / services
      await page.waitForURL(/\/(services|onboarding)/, { timeout: 15000 });

      // Navigate to Import Screen
      await page.goto('http://localhost:3000/onboarding/import');
      
      // Verify we are on the import screen
      await expect(page.locator('text=Import your historical data')).toBeVisible({ timeout: 15000 });

      console.log(`Iteration ${i} UI/UX navigation successful.`);
      
      // Clean up the created user
      await deleteUser(email);
    });
  }
});
