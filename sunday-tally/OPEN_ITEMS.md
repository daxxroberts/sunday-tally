# Immediate Open Items

Ship-blockers and finish-work for the paid-conversion + AI-import + AI-analytics push.
Items below are grouped by urgency. Anything under **Before first deploy** blocks going live; **Before first paying customer** blocks charging money; **Before GA** can ship after.

---

## Before first deploy (local → Vercel)

1. **Env vars** — fill every key in `.env.local.example`. Vercel project settings need the same.
   - `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
   - `NEXT_PUBLIC_APP_URL` (prod domain)
   - `CRON_SECRET` (random 32-byte hex; used by `/api/cron/trial-reminders`)

### API Keys — where to get each one

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API | Already set for dev. Per environment. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` key | Safe to ship to browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | Server only. Never import into a client component. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys → Create Key | Start with a low workspace spend limit. Rotate if it leaks. |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com → Developers → API keys → Secret key | Use the test-mode key (`sk_test_...`) until live. Swap to `sk_live_...` at launch. |
| `STRIPE_PRICE_ID` | Stripe dashboard → Products → create "$22/mo recurring" → copy `price_...` | One price per environment — prod + test use different IDs. |
| `STRIPE_WEBHOOK_SECRET` | Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints `whsec_...`. Prod: Stripe → Developers → Webhooks → add endpoint → copy the signing secret. | Local and prod have **different** values — do not share. |
| `RESEND_API_KEY` | resend.com → API Keys → Create API Key (Full Access) | After domain verification. Keep one key per environment. |
| `RESEND_FROM_EMAIL` | Set to a verified sender on your verified Resend domain | Format: `Sunday Tally <noreply@yourdomain.com>`. Unverified domains silently fail. |
| `NEXT_PUBLIC_APP_URL` | Your domain | `http://localhost:3000` locally, production domain on Vercel. Used for Stripe return URLs and email CTAs. |
| `CRON_SECRET` | Generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Paste the same value into Vercel env so the cron header matches. |

### Keys that are NOT in this codebase (safeguard list)

- **Stripe publishable key** — not needed; we don't use Stripe Elements client-side. All payment UI redirects to Stripe Checkout.
- **Google Sheets / OAuth credentials** — deferred per plan D-064. Sheets ingestion uses the public `export?format=csv` URL only.
- **Google Cloud service account** — not used.

### Setup order (avoids chicken-and-egg)

1. Supabase project exists → URL + anon + service_role.
2. Anthropic key → unblocks Stage A / analytics chat locally.
3. Resend domain verified → API key + from address.
4. Stripe: create product → price → `STRIPE_PRICE_ID`. Run `stripe listen` locally to get the webhook secret for dev.
5. Generate `CRON_SECRET`.
6. Deploy to Vercel, paste all env vars, add the live webhook endpoint in Stripe, swap its `whsec_...` into prod env.

2. **Migration `0011_billing_ai.sql` applied in prod** — confirm via Supabase dashboard that
   the 6 new columns exist on `churches` and the 5 new tables are created with RLS enabled.

3. **RLS smoke test on new tables** — as a logged-in member of church A, verify you cannot
   SELECT any row in `import_jobs`, `ai_usage_periods`, `ai_usage_events`, `billing_events`,
   or `notifications_sent` belonging to church B.

4. **Recharts + React 19 render check** — open `/dashboard/ai`, trigger the starter chip,
   confirm a chart renders without peer-dep console errors. If it breaks, the fallback is
   visx per plan D-067.

5. **Vercel cron permissions** — confirm `vercel.json` cron is active in the dashboard and
   that Vercel sends the `Authorization: Bearer $CRON_SECRET` header the route expects.

---

## Before first paying customer

6. **Stripe product + price** — create the $22/mo recurring price in Stripe, paste the
   `price_...` into `STRIPE_PRICE_ID`. Test with card `4242 4242 4242 4242` end-to-end:
   Checkout → webhook → `churches.subscription_status = 'active'` → paywall lifts.

7. **Stripe webhook URL** — add `https://<domain>/api/stripe/webhook` to Stripe webhook
   endpoints with `STRIPE_WEBHOOK_SECRET` pasted into env. Subscribe to:
   `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
   `invoice.payment_failed`.

8. **Resend domain verified** — DNS records added, sender address matches `RESEND_FROM_EMAIL`.
   Test by triggering a `trialEnding7d` manually (set a church `trial_ends_at = now() + 7d`
   and hit the cron endpoint with the Bearer secret).

9. **Paywall verification** — manually set a church's `trial_ends_at` to past. Log in as a
   member, confirm every `/settings/*` and every POST redirects to `/billing`. Confirm
   `/dashboard*` GETs still work for viewers.

10. **Paid AI budget reset** — confirm that on the 1st of a month, new `ai_usage_periods`
    row is auto-inserted on first call. Happens lazily in `ensurePeriodRow` — check once.

---

## Before GA (nice-to-have, not blocking)

11. **`aiSetupExhausted` email not firing** — plan D-059 says it fires the first time the
    trial setup bucket crosses its cap. Currently we surface the banner in UI but don't
    send the email. Hook into `recordUsage` in `src/lib/ai/budget.ts`: if
    `row.cents_used < cap && row.cents_used + cents >= cap`, send the email. Dedupe via
    `notifications_sent(kind='aiSetupExhausted')`.

12. **Invite-email on existing invite flow** — plan WS6 says the existing invite flow at
    `src/app/onboarding/invite/page.tsx` should call `sendEmail(to, 'invite', ...)`.
    Not yet wired. Without this, invites still work (link generated) but no email is sent.

13. **AppLayout tab bar — 4 tabs on mobile** — adding "Ask AI" makes 4 tabs for
    owner/admin, 3 for editor/viewer. Eye-check the mobile viewport; if tabs get cramped,
    either shorten "Dashboard" → "Stats" or move "Ask AI" into the Dashboard screen.

14. **Stage A/B import — real CSV test** — end-to-end with a real church's historical
    spreadsheet. Confirm: Stage A mapping looks sensible, confirmation UI is usable,
    Stage B inserts the right occurrences and attendance rows, dashboard matches the
    source totals within rounding.

15. **Trial countdown copy** — `/billing` currently shows days-left only. Owners have
    asked for an explicit end date. Show both.

16. **Abort / cancel import** — no way for an owner to cancel an `import_jobs` row that's
    stuck in `extracting`. Low risk but worth a button.

17. **Existing test suites** — run `test-e2e.mjs`, `test-qa-100.mjs`, `test-browser.mjs`
    against main. The import step is optional in onboarding, so these should still pass.
    Update `test-browser.mjs` to exercise the Skip path explicitly.

---

## Known deferred (from plan — not opening until next phase)

- Platform Owner Hub (`/platform/*`)
- Public marketing pages (`/`, `/features`, `/pricing`, `/security`, `/contact`)
- PDF / OCR ingestion for imports
- Promo codes, annual plan, per-seat pricing
- Usage packs / AI overage mid-month
- `platform_admins` table
- Cross-church rule promotion

---

## Decision check before build continues

- **D-059** — paid AI budget is unadvertised; exhaustion shows no numbers. Confirmed in
  `AiExhaustedBanner.tsx`. Do not surface cents anywhere in paid-tier UI.
- **D-062** — AI tool handlers inject `church_id` server-side. Confirmed in
  `runToolLoop`; the AI never receives `churchId` as input. Do not relax this.
- **D-063** — analytics chat uses only the 6 named metrics in `src/lib/ai/metrics.ts`.
  Do not add a free-form SQL tool.
