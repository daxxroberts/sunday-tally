# Field Notes — Rollout Plan (RANK + NOVA/FORGE + GROVE)

Turning the Field Notes cluster from "drafted" into a polished, dashboard-grade,
browsable knowledge base. Locked 2026-06-28. (Internal doc — no post frontmatter,
so it is never routed or listed.)

Foundation already shipped (commit 9a51574, branch feat/new-pricing-structure):
MDX rendering, ChartKit (StatGroup + TrendChart matching the app), chartData.ts
registry, Field Notes rename, contact page retired, author-footer de-duped.

---

## Phase A — Per-post polish (the bulk of the work)

For EACH post: convert `.md` -> `.mdx`, replace hand-drawn SVGs with real
StatGroup/TrendChart (data in chartData.ts), add concrete numbers + deltas, trim
the repetitive "13 years" intro to a varied or absent hook, keep <= 900 words,
assign a category. How-to posts also get numbered steps.

| Post | Category | Chart upgrade (real components) | Notes |
|------|----------|--------------------------------|-------|
| church-analytics-pearsons-law (hub) | Analytics | Keep measure->report->improve as a clean concept strip | KEEP the founder hook here (cornerstone) |
| attendance-up-church-shrinking | Analytics | DONE — 3 StatCards + attendance TrendChart | exemplar |
| summer-attendance-dip | Analytics | TrendChart: noisy weekly vs 4-wk average (2 series) + StatCard "4-wk avg ▼2%" | |
| kids-attendance-leading-indicator | Analytics | TrendChart: kids vs adults (leading/lagging, 2 series) | |
| giving-per-person-discipleship | Analytics | StatRow: total giving ▲ vs number of givers ▼ | |
| volunteer-burnout-ratio | Analytics | TrendChart: slots filled (flat) vs unique volunteers (falling) | |
| first-time-guest-followup | How-To | StatRow funnel: guests -> returned -> served in 30d -> stayed | |
| monthly-ministry-review | How-To | Optional StatCard; focus on numbered steps | the 20-min review as steps |
| start-with-one-metric | Getting Started | Minimal; one StatCard | numbered "start" steps |
| what-church-should-track | Getting Started | StatRow of the 5 decision metrics | |
| spreadsheet-quietly-fails | Getting Started | Optional "three siloed files" concept; likely no data chart | |

Bio rule (per [[founder-story]] memory): never repeat the same paragraph. Footer
already auto-stripped. Vary/limit the first-person hook; the full story = About page.

## Phase B — Knowledge base UX (categories + search)

- Add `category` frontmatter (Analytics | Getting Started | How-To) to every post;
  extend PostMeta + toMeta in `src/lib/blog.ts`.
- `/blog` index: category filter chips (All + 3) + a client-side text search box
  (title/description/tag match over the 11 posts — no backend needed).
- Show the category on each card (already showing tags[0]; switch to category).

## Phase C — About page

- New `/about` route (marketing group) with the full founder story (13 yrs analytics,
  board seat, no database, affordability conviction, Pearson's Law thesis, faith note).
- Link the post byline ("By Daxx Roberts") to /about.
- Person/AboutPage JSON-LD; add to nav? (decide) and sitemap.

## Phase D — AI assistant references the knowledge base

- Build a compact Field Notes index (title + one-line + category + slug) from
  `getAllPostsMeta()`.
- Add a `suggest_reading` capability to the analytics assistant
  (`src/app/api/ai/analytics/route.ts`): on interpretation/advice questions, surface
  ONE relevant Field Note as a link. Cite, never long-quote.
- Guardrail: stays a data assistant; reading suggestion is additive, 1 link max.
- TIMING: after posts are published/un-drafted (links must resolve).

## Phase E — Images (banana-claude)

- Needs Daxx: `/plugin marketplace add AgriciDaniel/banana-claude` + Google AI API key
  (free, aistudio.google.com/apikey).
- Then: `/banana generate` cover images per post (Editorial mode; coverImage paths
  pre-wired in frontmatter) + optional inline illustrations (Infographic mode).

## Phase F — Publish

- GROVE final Humanizer stamp on hub + all spokes + About.
- Flip `status: draft-pre-grove` -> published (reveals on index + sitemap + homepage band).
- Commit + (decide branch: move to main) + deploy.

## Suggested order
A (content + charts, the big one) -> B (categories/search) -> C (About) ->
E (images, once installed) -> D (AI reference) -> F (publish). B/C/E can run in
parallel with A since they touch different files.
