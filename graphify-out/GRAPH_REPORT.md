# Graph Report - sunday-tally\src  (2026-07-01)

## Corpus Check
- 220 files · ~261,660 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 837 nodes · 1342 edges · 26 communities detected
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `POST()` - 20 edges
2. `requireOwnerAdmin()` - 15 edges
3. `compileAndRun()` - 14 edges
4. `buildRows()` - 9 edges
5. `renderEmail()` - 9 edges
6. `GridConfig / ChurchGridConfig Object` - 9 edges
7. `resolveCaller()` - 8 edges
8. `getPostBySlug()` - 8 edges
9. `fetchMetricSeries()` - 8 edges
10. `createMinistry()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `deleteLocationAction()` --calls--> `syncStripeQuantity()`  [EXTRACTED]
  sunday-tally\src\app\onboarding\locations\actions.ts → sunday-tally\src\app\(app)\settings\locations\actions.ts
- `POST()` --calls--> `loadCodeMaps()`  [EXTRACTED]
  sunday-tally\src\app\api\widgets\[id]\duplicate\route.ts → sunday-tally\src\app\api\history\save\route.ts
- `POST()` --calls--> `decodeKey()`  [EXTRACTED]
  sunday-tally\src\app\api\widgets\[id]\duplicate\route.ts → sunday-tally\src\app\api\history\save\route.ts
- `POST()` --calls--> `isoToDateOnly()`  [EXTRACTED]
  sunday-tally\src\app\api\widgets\[id]\duplicate\route.ts → sunday-tally\src\app\api\history\save\route.ts
- `POST()` --calls--> `parseNumber()`  [EXTRACTED]
  sunday-tally\src\app\api\widgets\[id]\duplicate\route.ts → sunday-tally\src\app\api\history\save\route.ts

## Hyperedges (group relationships)
- **Dynamic History Grid Deliverable Set** — chat_grid_config_schema_ts, chat_grid_builder_ts, chat_onboarding_questions_ts, chat_history_grid_prototype_html, chat_historygrid_tsx, chat_historygrid_css, chat_historypage_example_tsx [EXTRACTED 1.00]
- **Example Grid Patterns (Emergent, Not Toggles)** — chat_v3_pattern, chat_v4_pattern, chat_flat_pattern, chat_service_time_pattern [EXTRACTED 1.00]
- **Scope Ã— Column Intersection System** — chat_scope_tags, chat_cell_state_resolution, chat_data_column_block, chat_column_group_block, chat_validation_rules [EXTRACTED 0.95]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (25): answerCurrentQuestion(), attendanceLabel(), confirm(), dedupeConfig(), describeCurrent(), handleConfirm(), handleContinue(), handleCreateMinistry() (+17 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (53): activeOwnerCount(), addCount(), addLocationAction(), allCampusOwnerCount(), allowedInviteRoles(), ancestorTagIds(), appUrl(), assertDepthOk() (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (6): fmt(), fmtNum(), fmtVal(), FourColRow(), groupHasEnterableMetrics(), hasEnterableMetrics()

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (7): getDashboardHref(), isActive(), tabHref(), dayPhrase(), TrialBanner(), isPayReachable(), resolveChrome()

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (48): AI Onboarding Pattern Recognition (Stage A / Stage B), buildConfigFromAnswers(), Cell State Resolution (EDITABLE / READ_ONLY / NA via RowÃ—Column Scope Intersection), church_period_entries / church_period_metrics (Proposed WK/MO Storage Table), Collapsible Volunteer Role Breakdown (Locked Vol Total + computedFrom), ColumnGroup Building Block (Parent Node, Infinitely Nestable), Column Composition Rules (Sibling / Parent-Child / Scope-Separated), Consolidation Auto-Fix Functions (consolidateWeekly/Monthly/SingleDayMetrics) (+40 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (22): AiBudgetExhaustedError, anthropic(), assertBudget(), bucketForKind(), runToolLoop(), attendanceByTemplateMonth(), attendanceByWeek(), givingByWeek() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (29): applyServiceNames(), applyServiceTimes(), reconcileAnswersIntoMapping(), buildNormalizedAreaIndex(), metricCodeFromDest(), normalizeCompoundKey(), routeTallRow(), routeWideRow() (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (10): createAndSendInvite(), inviteExpiry(), inviteUrlFor(), newInviteToken(), sendInviteEmail(), from(), resend(), sendEmail() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (33): buildChurchContextPack(), formatContextPack(), activeMembership(), appUrl(), dayWindow(), decodeKey(), DELETE(), extractChurchId() (+25 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (26): aggregate(), bucketKey(), compileAndRun(), describeSpec(), explainQuery(), fetchPaged(), isObj(), isStringArray() (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (20): buildColumnHeaders(), buildGrid(), buildRows(), flattenColumns(), formatMonth(), formatServiceDate(), formatWeek(), getMaxDepth() (+12 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (17): ensurePeriodRow(), getRemaining(), monthKey(), recordUsage(), resolveBucket(), appBase(), firstNameOf(), getChurchEmailData() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (11): buildBoundaries(), buildWeeklyFrom(), delta(), emptyFourWin(), fetchDashboardData(), fetchEntriesPaged(), fourWinFromWeekly(), ratioFourWin() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (8): isMissingColumn(), saveChurchPrefs(), ensureSinglePrimary(), resolveTotals(), allIds(), handleToggle(), nodeState(), toggleNode()

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (19): consolidateMonthlyMetrics(), consolidateSingleDayMetrics(), consolidateWeeklyMetrics(), findColumnById(), getAllColumnIds(), getAllGroupIds(), removeOrphanedColumns(), validateConfig() (+11 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (11): avgOfWeeks(), avgOfWeeksRaw(), buildSittingsFromEntries(), buildWeeklyFromEntries(), entryActiveDate(), enumerateWeeks(), fetchGivingWeekly(), fetchMetricSeries() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (5): animate(), drawLines(), initParticles(), Particle, resize()

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (8): aggregateMonths(), parseCount(), parseDateIso(), fetchGoogleSheetCsv(), getAllRows(), normalizeSource(), parseCsv(), stripBom()

### Community 18 - "Community 18"
Cohesion: 0.18
Nodes (11): extractFaqs(), getAllPostSlugs(), getAllPostsMeta(), getFeaturedPostsMeta(), getPostBySlug(), readPostFile(), renderMarkdown(), stripAuthorFooter() (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.35
Nodes (11): appUrl(), backLink(), button(), chip(), escapeHtml(), fmt(), planCard(), renderEmail() (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.24
Nodes (6): addDays(), shiftMonths(), shiftYears(), sundayOf(), weekOf(), weekStartOf()

### Community 21 - "Community 21"
Cohesion: 0.83
Nodes (3): loadSummaryMetrics(), saveSummaryMetrics(), storageKey()

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **11 isolated node(s):** `HistoryGrid.css (Production Styles)`, `HistoryPage.example.tsx (Usage Example)`, `SD Scope (Single-Day Entry)`, `Consolidation Auto-Fix Functions (consolidateWeekly/Monthly/SingleDayMetrics)`, `Sub-Categorization Exception (Separate Columns Valid for Plate/Online etc.)` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 22`** (2 nodes): `robots.ts`, `robots()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `AmbientBackground.tsx`, `AmbientBackground()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `index.ts`, `isOccurrenceComplete()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `vendor.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `HistoryGrid.css (Production Styles)`, `HistoryPage.example.tsx (Usage Example)`, `SD Scope (Single-Day Entry)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._