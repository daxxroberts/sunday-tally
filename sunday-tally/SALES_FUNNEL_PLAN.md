# Sunday Tally — Sales Funnel Plan

Produced by the BOT Growth workstream (SCOUT lead, GROVE copy gate, QUINN flow validation,
RANK content mapping, MARGIN pricing check, LUMEN buyer-behavior segmentation). Stage 1 of
the approved two-stage plan (see `.claude/plans` on Daxx's machine). Stage 2 (engineering)
implements Phase 1 (email) only; the ads section is planning-only, no spend, no campaign
created.

Locked inputs used throughout: [BRAND.md](BRAND.md) / [VOICE.md](VOICE.md) (indigo #4F6EF7,
gold #B8860B, no red, no exclamation marks, sentence case, show-the-church's-own-numbers
before any ask), 45-day trial (D-057), $22/mo flat per location (D-056), AI add-on tiers
Starter $29 / Plus $59 / Pro $99.

---

## Part 1 — Email Sequence (Phase 1, build now)

### The one change from a naive time-based drip

**LUMEN's finding:** lead/executive pastors are time-poor, non-technical, and skeptical of
software. A pure "day N → email N" drip breaks the moment someone hasn't finished setup yet —
showing them a feature tour before they've configured a single service reads as noise, not
help. So Day 2 branches on **activation state**, not just elapsed time. Everything after Day 2
assumes the branch resolved and the church is at least logging.

**Segmentation signals needed (Stage 2 to confirm exact source):**
- `has_completed_setup` — at least one active `service_schedule_versions` row exists.
- `has_logged_entry` — at least one row in `metric_entries` for this church.

### Sequence table

| # | Trigger | Kind (new) | Subject (GROVE-cleared) | Content source | CTA | Segmentation rule |
|---|---------|-----------|--------------------------|-----------------|-----|--------------------|
| 1 | Signup, immediate | `welcome` | "You're in — here's your first step" | None (product-only) | "Set up your first service" → onboarding start | Always sends. |
| 2a | Day 2 | `nurtureDay2Setup` | "One thing left before Sunday" | None (product-only) | "Finish setup" → onboarding | Only if `has_completed_setup = false`. |
| 2b | Day 2 | `nurtureDay2FirstEntry` | "Log this Sunday's numbers — it takes two minutes" | `start-with-one-metric.md` (one-number angle) | "Log this week" → entries page | Only if setup done, `has_logged_entry = false`. |
| 2c | Day 2 | `nurtureDay2Value` | "The one principle behind every church that measures well" | `church-analytics-pearsons-law.md` (hub) | "Read the piece" → blog | Only if `has_logged_entry = true`. |
| 3 | Day 5 | `nurtureDay5` | "Ask your dashboard a question, get a straight answer" | `build-your-first-widget.md` | "Try the AI widget builder" → dashboard | All active trials (setup done by now or repeat the Day 2a nudge instead — Stage 2 keeps the branch open). |
| 4 | Day 10 | `nurtureDay10` | "Attendance went up. Why did it feel smaller?" | `attendance-up-church-shrinking.mdx` (featured; founder-story attribution required per VOICE.md) | "See what your numbers say" → dashboard | All. |
| 5 | Day 21 | `nurtureDay21` | "Three weeks in — here's what your numbers already show" | Live `churchEmailData` stats (weeks tracked, attendance, giving, volunteers) | "Open your dashboard" | Only if `has_logged_entry = true`; if still false, send a second `nurtureDay2FirstEntry`-style nudge instead — never send a stats email with no stats. |
| 6 | Day 38 | `trialEnding7d` | *(existing, unchanged)* | — | — | — |
| 7 | Day 44 | `trialEnding1d` | *(existing, unchanged)* | — | — | — |
| 8 | Trial expired + ~10 days (mid archive-grace window, before `churchArchiving7d`) | `trialLapsedWinback` | "Your numbers are still here when you're ready" | Live stats if any exist, else generic | "Come back and pick up where you left off" → billing/dashboard | Only if `subscription_status` never converted to paid. Tone is re-engagement, not the data-safety framing of `churchArchiving7d` — these two must read as clearly different emails if a church gets both. |

**Why nothing sits between Day 21 and Day 38:** a 45-day trial with a pastor audience does not
tolerate a hard sales push mid-trial — VOICE.md is explicit that the app is "never salesy."
The existing `trialEnding7d`/`trialEnding1d` already carry the conversion ask; adding more
before that would read as pressure, not help.

**Founder-story attribution (VOICE.md requirement):** the Day 10 email is the one place in
this sequence that earns first-person founder voice ("I joined my own church's board and saw
this firsthand..."). Attribution is required wherever it's used — do not repeat it in other
emails or it stops feeling earned.

**What Stage 2 does NOT need to originate:** full email body copy. Subject lines and content
anchors above are GROVE-cleared; body copy follows the existing pattern in
[templates.ts](src/lib/email/templates.ts) (value/stats → plan+price if relevant → one primary
CTA → one way back to dashboard) and should get its own GROVE pass per email before shipping,
same as this table did.

---

## Part 2 — Paid Ads Plan (Phase 2, planning only — no spend, no campaign created)

**MARGIN's flag, read this before acting on any number below:** Sunday Tally has no
confirmed retention or CAC data yet. Every figure here is a starting hypothesis for a small
test budget, not a forecast. Label accordingly if this leaves the team.

### Channel choice

**SCOUT's recommendation: Google Search first, not Meta, and not yet LinkedIn/Microsoft.**
Reasoning: LUMEN's buyer profile (time-poor, skeptical of "software," non-technical) responds
to intent capture, not interruption. Someone searching "church attendance tracking software" is
already past the awareness problem — the ad only needs to get them to a page that proves the
product isn't another spreadsheet. Meta/social awareness content has to do more convincing work
per dollar for this exact buyer, and LinkedIn CPCs are high relative to the plan's $22–$99/mo
price points. Defer both to a later phase once Search performance gives real CAC data.

- **Primary channel:** Google Search, using RANK's existing primary keyword set (`church
  analytics software`, `church attendance tracking`, `church giving dashboard`, `volunteer
  management analytics`, `church data tool`) — these already exist as SEO targets in
  [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md)/growth.md context, so paid and organic reinforce
  the same terms rather than splitting focus.
- **Secondary (later, not now):** Meta, for retargeting only — warm audience (site visitors,
  abandoned trial signups) rather than cold prospecting, once there's a pixel/CAPI event volume
  worth targeting against.
- **Deferred, low priority:** LinkedIn and Microsoft Ads — CPC too high for this price point
  given a solo-operator budget; revisit only if Search saturates.

### Audience hypothesis

Lead/executive pastors and ministry admins at small-to-mid churches, actively searching —
not a broad "church" demographic buy. Geo: US, English-language, standard church-search intent
modifiers ("software," "tracker," "dashboard," "app").

### Budget range (test tier, not a committed spend)

- **Test budget:** $500–$1,000/mo, Google Search only, 2–3 tightly-matched keyword clusters
  from RANK's primary list — not the full keyword set at once.
- **CAC ceiling hypothesis:** keep target CAC under 2–3 months of expected MRR at the modal
  plan (single location, base $22/mo, possibly + Starter AI $29 — so a ~$50–150 CAC ceiling
  depending on which tier converts). This is MARGIN's placeholder math, not validated —
  recalculate once 20–30 paid conversions exist.
- **How ad-driven signups plug into Part 1:** identical sequence, no separate track. A paid
  click that signs up for trial enters at "Welcome" the same as an organic signup — the funnel
  doesn't fork by acquisition source. If channel-specific messaging is wanted later (e.g. a
  different Day 0 email for ad-driven signups), that's a new open item, not something to build
  speculatively now.

### Open items (per GATE/SAGE transparency standard — flag, don't guess)

1. No CAC/LTV data exists yet — the budget and ceiling above are working assumptions, to be
   revised after the first real batch of paid conversions.
2. Retargeting requires pixel/CAPI event volume that doesn't exist yet — defer Meta until
   Search has run long enough to generate it.
3. `has_completed_setup` / `has_logged_entry` flags (Part 1, segmentation) need a Stage 2
   engineering confirmation of exact source tables before the Day 2 branch can be built.

---

**SAGE gate:** This plan is approved for Stage 2 (email) implementation as scoped in Part 1.
Part 2 (ads) is explicitly parked as planning-only — no campaign, no spend, no ad account
work — until Daxx decides to activate it.
