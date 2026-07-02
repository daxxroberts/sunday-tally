# Sunday Tally — Blog Cluster Plan (RANK + GROVE)

Strategy shift: one mega-pillar → **hub + micro-post cluster**. The Pearson's Law
pillar is the hub; each buried idea becomes a tight spoke with ONE profound point.
More entry points (each matched to a real search question), no boring slog, and
every piece earns its existence. Locked 2026-06-27.

## The editorial bar (GROVE) — nothing surface-level ships
Every post must clear all three or it doesn't publish:
1. **One information-gain insight** — something a smart pastor didn't already know (a "huh, never thought of that"). Not "track attendance to grow."
2. **Earned, not borrowed** — proof via the founder's lived experience or a clearly-illustrative example/chart. No fabricated stats (the niche has no citable adoption data; originality carries it, per the pillar's editorial note).
3. **One Monday action** — a thing the reader can do this week.
Voice: measurement = *attention = care*, never surveillance. People, not KPIs. ≤900 words. Founder first-person where it earns trust (attribution required). FAQ + JSON-LD on each.

## Hub
- **church-analytics-pearsons-law** — "Church Analytics and the One Principle That Makes Ministries Grow" (exists, draft-pre-grove). Becomes the spine; its 5 `[INTERNAL-LINK]` stubs resolve to the spokes below.

## Spokes (the cluster)
| # | Slug | Title (working) | The ONE insight | Targets the question | Home |
|---|------|-----------------|-----------------|----------------------|:----:|
| 1 | attendance-up-church-shrinking | Your attendance went up. So why does it feel smaller? | A rising *total* can hide diverging ministries; attendance up while giving + volunteers fall is a warning, not growth. | "is my church actually growing" | ★ |
| 2 | summer-attendance-dip | The summer dip is usually a lie | The seasonal drop is often a *measurement artifact* (regulars vs. occasionals), not real disengagement — and misreading it makes you panic-program. | "why does church attendance drop in summer" | ★ |
| 3 | first-time-guest-followup | A first-time guest who serves in 30 days stays | Retention lives in the *second step*, not the welcome; measure guest→serve conversion. | "how to keep first-time church guests" | ★ |
| 4 | kids-attendance-leading-indicator | Your kids' room forecasts your church | Kids attendance *leads* young-family retention; adult numbers lag it by months. | "kids ministry attendance trends" | |
| 5 | giving-per-person-discipleship | Giving per person is a discipleship number, not a budget number | A steady total can mask a shift from broad participation to a few large gifts — a different church to pastor. | "church giving trends / per capita giving" | |
| 6 | volunteer-burnout-ratio | You can see burnout before it happens | Volunteer-to-attendance ratio + thinning coverage flags burnout early; this is care for the people serving. | "volunteer burnout church" | |
| 7 | monthly-ministry-review | The 20-minute review that changes everything | The "report" half of Pearson's Law nobody does — how to actually run it. | "church board reporting / ministry review" | |
| 8 | start-with-one-metric | Start with one number, not a dashboard | Closing the loop on a single metric beats a full system you won't maintain. | "how to start tracking church data" | |
| 9 | what-church-should-track | Stop counting what doesn't help you pastor | Vanity totals vs. the 5 decision metrics that actually drive choices. | "what should a church track / church KPIs" | |
| 10 | spreadsheet-quietly-fails | Why your spreadsheet quietly fails you | Tracking ≠ reporting; a number on one laptop is invisible. A systems problem, not a discipline problem. | "church attendance spreadsheet" | |

Internal-link wiring back into the hub's existing stubs: #9→"core ministry metrics", #7→"monthly board reporting", #5→"giving analytics", #8→"start tracking". Every spoke links up to the hub; the hub links down to all spokes (hub-and-spoke).

## Homepage — "Field notes" section (NEW)
The landing page surfaces no blog today. Add a **"Field notes from real church data"** band near the bottom (above the final CTA): 3 cards (title · one-line hook · read link), pulling the **featured** posts (★ above) from `src/lib/blog.ts`. Gives the homepage fresh proof-of-thinking + sends SEO link equity into the cluster. Build = a `FeaturedPosts` server component reading `getAllPosts()` filtered to `featured: true` frontmatter.

## Publishing order
1. Finalize hub (GROVE stamp). 2. Spokes #1, #2, #3 (homepage set). 3. Build the homepage Field-notes section. 4. Remaining spokes #4–#10, one per week. Each spoke ships only after clearing the bar above.

**Status: all 10 spokes + hub published.** Round 2 below is topic + hook research only — SCOUT/RANK, GROVE gate pending on any actual titles once writing starts. No article content written yet.

---

## Round 2 — next batch candidates (research only, 2026-07-01)

RANK research, real search/news signals — not invented. Demand labeled per the transparency
standard: **confirmed** = grounded in a cited 2026 industry report or stat; **estimated** = my
inference from the pattern, not a direct source.

| # | Working title | Keyword / intent | The gap | Demand |
|---|---|---|---|---|
| 11 | Attendance rose nationwide for the first time in 25 years. Does that mean anything for *your* church? | "is church attendance really growing 2026" | National attendance ticked up for the first time in a quarter-century ([Lifeway Research](https://research.lifeway.com/2026/05/01/church-attendance-increases-for-the-first-time-in-decades/), [Barna](https://www.barna.com/research/young-adults-lead-resurgence-in-church-attendance/)) — a macro story every pastor will hear about. The gap: nobody's telling them the national number says nothing about their own numbers. **Differentiation note:** adjacent to #1 (attendance-up-church-shrinking), but that post is about a rising total masking diverging ministries *within* one church; this one is about a national headline vs. local reality — a macro-vs-local angle, not a repeat. | Confirmed |
| 12 | Your Sunday numbers might be hiding a demographic shift | "church attendance gender gap 2026" / "why is my church aging" | Men now outpace women in church attendance for the first time in decades, and the gap is widest among Gen Z ([Barna](https://www.barna.com/research/unexpected-gender-gap/)). A church's aggregate attendance count can rise even as a specific group quietly disengages. **Product tie-in:** demonstrates the per-count demographic breakdown already shipped (count_demographic feature) — a natural feature-showcasing piece. | Confirmed |
| 13 | The giving number that actually predicts a crisis | "church giving concentration risk" / "church budget dependent on few donors" | A church where 60% of the budget comes from 10 households looks financially healthy on the total line and is actually fragile ([Malphurs Group](https://malphursgroup.com/financial-reports-every-church-member-actually-wants-to-see/)). Distinct from #5 (giving-per-person-discipleship, about per-person *average*) — this is about *concentration*, a different failure mode entirely. | Confirmed |
| 14 | How many weeks of runway does your church actually have? | "church cash reserves" / "church financial health metrics" | Median church cash reserves fell from 30 weeks to 22 weeks year over year — a real, current financial-health metric no existing spoke covers. | Confirmed |
| 15 | Only 1 in 10 first-time guests come back. Here's the window that changes it | "church guest retention rate" / "how many first time visitors return" | National first-visit-to-second-visit return rate is roughly 10-20%, and callback within 48 hours makes a return ~75% more likely ([EvangelismCoach](https://www.evangelismcoach.org/6-ways-to-follow-up-on-first-time-church-visitors/), [ChurchLeaders](https://churchleaders.com/outreach-missions/outreach-missions-articles/308199-500-second-time-guests-average-church-beth-colletti.html)). **Differentiation note:** #3 (first-time-guest-followup) is about the guest→*serve* conversion path; this one leads with the stark abandonment stat and the 48-hour follow-up window — a distinct, more tactical companion angle, not a repeat. | Confirmed |
| 16 | Small churches don't need to apologize for their size — the giving data says the opposite | "small church giving statistics" | Churches under 100 attendees see meaningfully higher per-capita giving than larger churches in some datasets — a myth-busting, affirming angle that lines up with the brand's "any church, any size" positioning. Estimated confidence on the exact percentage (source data varies by study; treat the number as illustrative, not a headline stat, per the "no fabricated stats" rule). | Estimated (direction confirmed, magnitude varies by source) |
| 17 | Is attendance even the right number to watch anymore? | "best church metrics to track 2026" | 2026 industry commentary (Lifeway, Barna) is actively questioning whether attendance alone should remain the primary metric, given it doesn't capture discipleship or engagement. **Differentiation note:** #9 (what-church-should-track) is the evergreen framework piece (vanity totals vs. 5 decision metrics); this is a news-hook piece pegged to a live 2026 debate — different angle, different entry point, can cross-link to #9 rather than replace it. | Confirmed |
| 18 | The board report nobody reads (and the one-page version that gets read) | "church board report template" / "how to report to church board" | Budget/report committees tend to keep producing the reports they've always produced, regardless of whether anyone reads them. **Differentiation note:** #7 (monthly-ministry-review) is about the review *cadence*; this is about report *format and legibility* — a different failure mode (communication, not process). | Estimated |
| 19 | The volunteer math nobody does: how many roles is too many? | "church volunteer burnout prevention" | Concrete, tactical rule of thumb from church-ops research: no volunteer should carry more than 1-2 roles, with built-in rotation breaks. **Differentiation note:** close to #6 (volunteer-burnout-ratio, an early-warning *ratio* metric) — this is the tactical follow-up ("here's the rule to apply"), best sequenced as a companion piece linking back to #6, not a standalone competing post. Flag for Daxx's call on whether to fold this into #6 as an update instead of a new spoke. | Confirmed |

### Hook pattern library (5 patterns, not just one shape)

1. **Contrarian-complication** (already locked, spokes #1/#2/#3) — state a common assumption, then complicate it. *"X happened. So why does it feel like Y?"*
2. **News-hook** — peg to a real, dated, cited finding and ask "does this apply to you?" Distinct from evergreen framework pieces; earns urgency from being current. → #11, #17.
3. **Stat-shock cold-open** — lead with a jarring specific number as the headline itself, before any explanation. → #15 ("Only 1 in 10...").
4. **Reassurance-against-a-myth** — name a quiet insecurity (being small, being behind) and flip it with real data. Warm, affirming, matches VOICE.md's pastoral register. → #16.
5. **Taboo-naming / permission-giving** — say the thing nobody says out loud (a report nobody reads, a role overload nobody admits). Gentler than the "call out the evil" pattern used elsewhere in the genre — ours stays pastoral, not accusatory. → #18, #19.

Don't let every future title use pattern #1 — the existing 3 featured spokes already lean hard on
contrarian-complication; Round 2 deliberately diversifies.

### Image strategy — flag only, not a build-out

The Field & Flock cover-image template (shepherd + flock editorial illustration, locked, no red,
16:9, no text — `docs/field-and-flock-image-brand.md`) already covers *brand consistency*. What's
still undecided: whether each new content *category* (financial-fragility, demographic-shift,
board-governance, guest-retention) should get its own documented scene variant so image generation
doesn't get reinvented from scratch per article, the way the per-article SCENE has been handled so
far. Worth a short dedicated pass once Daxx picks which Round 2 topics move forward — not needed
before then.

### Open items for Daxx
1. Which of #11-19 to greenlight for actual writing, and in what order.
2. Call on #19 — new standalone spoke, or fold into #6 as an update?
3. Whether the image-scene-variant pass (above) happens now or after topics are picked.

---

## Round 2, batch 1 — written and published (2026-07-01)

Daxx: "you review them and decide." Call made — picked the 4 strongest, most clearly distinct
candidates (confirmed demand, no cannibalization risk once written) over the 5 held back. Each
cleared the editorial bar (info-gain insight, illustrative proof in-house style — no external
citations, matching the locked pattern of the original 10 — one Monday action, FAQ) and got a
GROVE pass before shipping.

| # | Slug | Title | Hook pattern | Home |
|---|------|-------|---------------|:----:|
| 12 | who-actually-filled-the-room | Your Attendance Total Can't Tell You Who Actually Filled the Room | Contrarian-complication (age-cohort variant — distinct from #4 kids-attendance-leading-indicator, which tracks kids-vs-adults over time; this is a same-Sunday composition snapshot) | |
| 13 | giving-concentration-risk | The Giving Number That Actually Predicts a Crisis | Stat-shock — distinct from #5 giving-per-person-discipleship (per-giver average) — this is about concentration/dependency risk | |
| 15 | guest-followup-48-hours | Your Best Shot at a Second Visit Closes in 48 Hours | Stat-shock cold-open — companion to #3 first-time-guest-followup, not a repeat: covers the 48-hour contact window that happens *before* that post's 30-day serve step | |
| 16 | small-church-commitment-myth | Small Churches Don't Need to Apologize for Their Size | Reassurance-against-a-myth | |

**Held back this round** (not written): #11 (too close to #1's territory — macro-vs-local
distinction was real but thin), #14 (cash runway — good candidate, next batch), #17 (too close to
#9, risked reading as a rehash), #18 (estimated-confidence angle, wanted a cleaner one first),
#19 (still needs Daxx's call — fold into #6 vs. standalone).

**Not yet done:** cover images (all 4 reference `/blog/<slug>-cover.png` per convention, not yet
generated). Scene prompts for all 4 now written under the new differentiation system in
`docs/field-and-flock-image-brand.md` (§ "Differentiation system", scenes #17-20) — each piece
got a distinct color family + compositional shape signature so they don't blend together in the
list view, per Daxx's 2026-07-01 request. Not added to the homepage "Field notes" band
(`featured: false` on all 4) — flip to `true` if any should get homepage placement.
