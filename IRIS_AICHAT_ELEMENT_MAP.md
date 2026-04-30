## Status: Complete — Ready for build
## Version: 1.0 (2026-04-19)
## Screen: AI Chat (/dashboard/ai)

# IRIS Element Map — AI Chat
## Version 1.0 | 2026-04-19
## Status: Built and deployed

### Screen Purpose
Conversational analytics interface. Owner, Admin, and Editor roles can ask natural-language questions about their church's ministry data. Claude answers using live Supabase data via the SSE streaming endpoint `/api/ai/analytics`. Viewer role cannot access this screen (AppLayout tab hidden, API returns 403).

### Route
`/dashboard/ai` — tab label "Ask AI" in AppLayout

### Role Access
| Role | Access |
|---|---|
| owner | Full |
| admin | Full |
| editor | Full |
| viewer | No access — tab not shown, API returns 403 |

### Data Sources
| Data | Source |
|---|---|
| AI responses | POST `/api/ai/analytics` — SSE stream |
| Budget exhausted signal | SSE `error` event with `code: "ai_budget_exhausted"` |

---

### Elements

#### E1 — Page Header
- Sparkle icon (orange-600) + label "Ask Sunday Tally"
- Sub-label: "Questions answered from your church's data only"
- Always visible. No role variation.
- `flex-none` — does not scroll.

#### E2 — Empty State / Suggested Prompts
- Visible when `messages.length === 0`
- Label: "Try asking…"
- Four suggested prompt buttons (pill cards, white bg, stone border):
  1. "What 3 months had the highest volunteers?"
  2. "Compare giving this year vs last year"
  3. "What's our average Easter attendance?"
  4. "How has kids attendance trended this year?"
- Each button fires `send(promptText)` on click
- Disabled while `busy`

#### E3 — User Message Bubble
- Right-aligned
- stone-100 background, stone-200 border, rounded-2xl rounded-tr-sm
- Displays raw question text
- One per user turn

#### E4 — Assistant Message Block
Four sub-elements, all in one message container (flex col, space-y-3):

##### E4a — Thinking Indicator
- Visible when: streaming AND no streamText yet AND no charts
- "s" avatar (orange-50 bg, orange-600 text)
- Three bouncing dots (stone-400, staggered animation delay 0/150/300ms)
- Label: "Checking the books…" (stone-400, text-xs)

##### E4b — Streaming Text
- Visible when: streamText is non-empty AND finalMarkdown is empty
- `whitespace-pre-wrap leading-relaxed text-sm text-stone-800`
- Blinking cursor `|` appended while streaming (animate-pulse)
- Disappears when finalMarkdown arrives (replaced by E4d)

##### E4c — Chart Artifact Card
- Visible when: SSE `chart` event received
- white bg, stone-200 border, rounded-xl, shadow-sm
- Title: 11px uppercase tracking-wider, stone-500
- Recharts chart at h-52: type = bar | line | area
- Color palette (per yKey, cycled): #c2705a (terracotta), #6b9e8a (sage), #2563eb, #a855f7, #f97316
- Multiple charts can appear per message (one per SSE chart event)

##### E4d — Final Answer Card
- Visible when: finalMarkdown is non-empty
- orange-50 bg, orange-100 border, rounded-xl
- `whitespace-pre-wrap text-sm text-stone-900 leading-relaxed`
- Replaces E4b (streamText no longer shown once finalMarkdown arrives)

#### E5 — Error State
- Visible when: `asst.error` is set
- red-50 bg, red-100 border, rounded-lg
- Shows error message string (text-xs text-red-700)

#### E6 — Follow-up Chips
- Visible after each completed assistant message (`done: true` AND no error)
- Three chips (border-stone-200, rounded-full, text-xs text-stone-600):
  1. "Ask a follow-up" → focuses textarea
  2. "Show another view" → no-op (stub)
  3. "Export this data" → no-op (stub)

#### E7 — Composer
- `flex-none` — pinned at bottom, never scrolls
- Textarea: auto-resize (1 row → max 120px), stone-300 border, rounded-xl, orange-200 focus ring
- Send button: orange-600 bg, rounded-xl, disabled when busy OR input empty
- Enter key sends (Shift+Enter for newline)
- Both disabled while `busy`
- NOT visible when budget exhausted (replaced by E8)

#### E8 — Budget Exhausted Banner
- Replaces E7 composer when `exhausted: true`
- Renders `<AiExhaustedBanner />` (amber, no props)
- Message: "You've used all your AI for this period. AI will be available again in your next billing period."

---

### State Machine

```
EMPTY (messages.length === 0)
  → E2 (suggested prompts) visible
  → E7 composer enabled

STREAMING (busy = true, last message is assistant, done = false)
  → E4a (thinking) if no text/charts yet
  → E4b (streaming text) once delta arrives
  → E4c (charts) as chart events arrive
  → E7 composer disabled

COMPLETE (done = true, no error)
  → E4c (charts) remain visible
  → E4d (final answer) visible
  → E6 (follow-up chips) visible
  → E7 composer re-enabled

ERROR (done = true, error set)
  → E5 visible
  → E7 composer re-enabled

EXHAUSTED (exhausted = true)
  → E7 replaced by E8
```

---

### Layout Structure

```
┌─ E1: Header (flex-none, white bg, border-b stone-200) ─────────┐
│  ✦ Ask Sunday Tally                                              │
│  Questions answered from your church's data only                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Thread (flex-1 min-h-0 overflow-y-auto, stone-50 bg)           │
│                                                                  │
│  [E2: Suggested prompts — empty state only]                      │
│                                                                  │
│  [E3: User bubble — right aligned]                               │
│  [E4a: Thinking dots]                                            │
│  [E4b: Streaming text + cursor]                                  │
│  [E4c: Chart card(s)]                                            │
│  [E4d: Final answer card — orange-50]                            │
│  [E5: Error message]                                             │
│  [E6: Follow-up chips]                                           │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  E7: Composer (flex-none, white bg, border-t stone-200)          │
│  [textarea               ] [Send]                                │
│  — OR —                                                          │
│  E8: AiExhaustedBanner (amber, replaces composer)                │
└─────────────────────────────────────────────────────────────────┘
           ↑ AppLayout fixed tab bar (pb-24 clearance)
```

---

### NOVA Items
| # | Item |
|---|---|
| N1 | History filter: only `done: true` assistant messages sent as context. In-progress streaming messages excluded. |
| N2 | SSE via `fetch` POST + ReadableStream (not EventSource — EventSource only supports GET). |
| N3 | `final` event replaces streamText display with finalMarkdown card. Both are stored independently in state. |
| N4 | Budget exhausted: SSE error code `ai_budget_exhausted` → sets `exhausted` state → replaces composer with banner. |
| N5 | `min-h-0` on thread div prevents flex overflow on iOS Safari (known flex + overflow bug). |

---

### Decisions Locked Here
| Decision | Value |
|---|---|
| History window | Last 6 messages (3 turns) |
| Layout | Single-column (mobile-first, no split) |
| Chart renderer | Recharts (already installed) |
| Color palette | Stone/orange (terracotta #c2705a primary, sage #6b9e8a secondary) |
| Follow-up chips | Static 3 hardcoded (no dynamic suggestions from API) |
| Viewer access | Denied (tab hidden in AppLayout, API returns 403) |
