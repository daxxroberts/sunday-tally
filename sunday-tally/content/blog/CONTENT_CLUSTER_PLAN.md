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
