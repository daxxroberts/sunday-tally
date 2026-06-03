# SundayTally — Design System & UI/UX Rules
## Version 1.0 | 2026-06-02 | Source: the Entries-screen design pass (ui-ux-pro-max + Builder calls)
## Status: Active — applies to ALL screens (Dashboard, History, Settings, Locations, Entries…)

> These are the hardened determinations from designing the Entries page. Every new page follows
> them so the product reads as one consistent thing. Reference rule numbers (DS-#) in reviews.
> Reference implementation: `sunday-tally/src/app/mockup/weekly-entry/page.tsx`.

---

## 1 · Tokens

### DS-1 Palette (use these hexes, not ad-hoc colors)
| Role | Hex | Use |
|---|---|---|
| **Brand** | `#4F6EF7` (AccessSync blue) | active tab, primary buttons, accent bars, brand mark, interactive focus |
| **Brand-dark** | `#3D5BD4` | brand text on light, hover, eyebrow labels |
| **Status — complete** | `#22C55E` sage (text `#15803D`) | done / positive only |
| **Status — needs/attention** | `#F59E0B` amber (text `#B45309`) | needs-entry, attention only |
| Surface | `#FFFFFF` | cards, inputs |
| App bg | slate-50 `#F8FAFC` | page background |
| Text | slate-900 headings · slate-600/700 body · slate-400 hints | 4.5:1 min |
| Borders | slate-200 | card/input borders |
| **Ministry accents** | Adults `#4F6EF7` · Kids `#8B5CF6` violet · Youth `#06B6D4` teal | category accent bars/labels only |

### DS-2 **NO RED, EVER.** Red reads as an error/destructive. Attention = amber, success = sage. Youth is teal, not rose.

### DS-3 Color discipline — no semantic collision. Each palette lane has one job:
- **Brand blue** = interactive / active / brand.
- **Sage + amber** = *status only* (complete / needs).
- **Ministry accents** (blue/violet/teal) = *category only*.
- **Neutral slate** = *metadata* (e.g. cadence tags).
Never reuse a status color for a category, or a category color for status.

### DS-4 Typography
- Body/UI: **Fira Sans**. Headings bold/extrabold, tight tracking.
- **All numerals: Fira Code, `tabular-nums`** (`.font-num`). Numbers always monospaced + right-aligned so columns scan cleanly.

### DS-5 Shape & depth
- Cards/sections: `rounded-2xl`, `border border-slate-200`, `shadow-sm`. Inputs/controls: `rounded-lg`/`rounded-xl`.
- Category cards carry a **left accent bar** (`h-x w-1.5 rounded-full`) in the ministry/zone color.
- Content width: centered `max-w-3xl` (entry/forms). Keep one max-width per page.

---

## 2 · The Status System (DS-6) — one vocabulary everywhere
Three states, rendered as **equal-size small circles** (`h-3.5 w-3.5`), outline style:
- **Not started** → gray outline (`border-2 border-slate-300`)
- **Needs entries** → **orange outline** (`border-2 #F59E0B`) — *outline, not filled*
- **Complete** → solid sage circle w/ white check (`#22C55E`)

Rules:
- Same circle is used on tabs, cards, and counts — never a different size or a wordy badge.
- **No "Complete / Needs entries" text pills** — the circle carries it.
- **No legend** — the three states are self-explanatory.
- Completion summaries are **plain text** ("1 of 4 complete"), not a bordered card.
- Color is never the only signal (shape: outline vs check differs too — DS-18).

---

## 3 · Components

### DS-7 Cards
Header row: `[accent bar] [name] [· role/meta, muted]  …………  [action(left)] [status circle(right, far edge)]`. Body = tidy rows, `divide`/hover-highlight. Status circle sits at the **far right edge**; the action that precedes it goes to its left.

### DS-8 Category / role labels — **plain text with a leading middle dot**, not pills
`Experience · Adults` → name bold slate-900, "· Adults" in `text-slate-400`. Reserve pill/chip styling for genuine emphasis or true status, never for plain category labels.

### DS-9 Derived vs entered — always distinguishable
Totals/subtotals are **derived, never editable**. Show them as bold numbers (not input boxes), label them quietly ("Total", "calculated" in muted slate). A derived value never looks like an input.

### DS-10 Inputs / Fields
- Right-aligned, tabular numerals, **consistent fixed width**, placeholder `—` when empty.
- **Status/notes sit to the LEFT of the input** (fixed-width column) so every input box aligns on a clean right edge across rows.
- States: empty · **needs entry** (amber text, amber input border) · saving… · **Saved ✓** (sage). Never red.
- `<label htmlFor>` always; numbers use `inputMode="numeric"`.

### DS-11 Autosave (DS + D-080)
Save on blur = one optimistic, async, idempotent upsert. Quiet per-field "Saved ✓" + a page-level "saves automatically" reassurance. Never a giant submit. Perf bar: commit p95 < ~300ms, UI never blocks, every save shows confirmed/failed.

### DS-12 Tabs
One segmented control, brand-blue active state, equal treatment. Each tab may carry its status circle (DS-6). Don't style one tab as a "filter" if it's actually an entry/section.

### DS-13 Context navigators
Header pills for context (week navigator `‹ … ›`, campus pin). A pill that's set elsewhere is a **context indicator** (with a title hint), not a live control on this page.

### DS-14 Icons — SVG only
Lucide-style inline SVGs, 24 viewBox, consistent sizing. **Never emojis or unicode glyphs** (`‹ ▾ ✓`) as icons. Icon-only buttons get `aria-label`/`title`.

### DS-15 Affordance restraint
Secondary controls are low-key: small, **no chrome until hover** (e.g. edit = a small *filled* pencil; its round background appears only on `hover`). Don't compete with the data.

### DS-16 Metadata indicators
Non-status metadata (e.g. cadence DAILY/WEEKLY/MONTHLY) = small **neutral slate** tag (outline/`bg-slate-50`), uppercase, next to the label. Never a status color, never an icon-heavy emblem.

---

## 4 · Interaction & Accessibility

### DS-17 Motion: transitions 150–300ms, `transition-colors`/opacity (no layout-shifting scale on hover). Respect `prefers-reduced-motion`.
### DS-18 Color is never the only signal — pair with shape/check/text (status circles, etc.).
### DS-19 Focus: visible `focus-visible` ring in brand blue on every interactive element. Touch targets ≥ 44px where practical.
### DS-20 Vertical centering: inline circles/icons next to text use `inline-flex items-center` containers + `align-middle leading-none` so they center on the label's vertical axis (don't trust baseline).
### DS-21 Contrast: body text slate-600+ (never slate-400 for primary content); 4.5:1 minimum.

---

## 5 · Layout, IA & Naming

### DS-22 IA: **Dashboard · Entries · History · Settings.** "Services" is a *Settings* concept (configure), not a nav page (D-085).
### DS-23 Declutter by default — every screen earns each element. We removed: redundant total cards, the status-legend card, loud "summed" tags, "week at a glance" headers, category pills. When in doubt, cut chrome and keep the data.
### DS-24 Naming is future-proof & cadence-neutral: "Entries" not "Services"; "Stat Entries" not "Weekly Entries"; "Totals" not "Summary". Don't bake an assumption (weekly) into a label.
### DS-25 Settings should visually **mirror the entry structure** it configures (D-079 parked) — configuring feels like entering.

---

## 6 · Anti-patterns (things we explicitly removed — don't reintroduce)
- ❌ Red for attention/needs.   ❌ Filled status dots / mismatched dot sizes.
- ❌ Category labels as colored pills.   ❌ Wordy status badges where a circle works.
- ❌ Loud "Σ / calculated / summed" pills — keep derived markers quiet.
- ❌ Emoji/unicode glyph icons.   ❌ Status text/indicator to the right of inputs (breaks alignment).
- ❌ A derived total rendered as/near an input.   ❌ Always-visible chrome on secondary actions.
- ❌ A bordered "status card" where plain text does the job.

## 7 · Mockup discipline
Design previews are throwaway routes under `/mockup/...`, ribboned "not wired to data", with decision-reference comments, **uncommitted until promoted** to a real route. The mockup is a visual reference; the IRIS element map is the build spec.
