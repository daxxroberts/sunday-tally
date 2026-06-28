# Sunday Tally — Brand

The single source of truth for how Sunday Tally looks and sounds. Pairs with
[VOICE.md](VOICE.md) (verbal) and `DESIGN_SYSTEM.md` (in-app component rules).
Locked 2026-06-27.

---

## What it is

Simple, affordable analytics for growing churches. Pastors log weekly ministry
numbers (attendance, volunteers, giving, stats) and see them clearly — week over
week, month over month, year over year — without spreadsheets or a data team.

**Audience.** Lead/executive pastors and ministry admins at small-to-mid churches,
often non-technical, time-poor, and skeptical of "software." They care about
people and stewardship, not dashboards for their own sake.

**Positioning thesis — Pearson's Law:** *what gets measured and reported on
improves.* Sunday Tally exists so every church, regardless of size or budget, can
measure and report well — tied to faithful stewardship of the ministry. (Founder
story is a required E-E-A-T asset; attribution required when used — see VOICE.md.)

---

## Name & wordmark

- Always two words, title case: **Sunday Tally**. Never "SundayTally" in copy.
- **Wordmark** = "Sunday" in Ink + "Tally" in Indigo: <span>Sunday</span> **Tally**.
  Use the two-color wordmark wherever brand presence matters (app header, emails,
  marketing). Single-color (all Ink) is the fallback on constrained surfaces.
- **Logo mark** (interim): an `S` in a rounded square (`border-radius` ~22%),
  Ink background, white letter. A proper mark is a future project — do not block on it.
- Tagline (editorial): *"Reveal thy numbers."* — reverent, used sparingly in
  display type, not in UI chrome.

---

## Color

Indigo is the brand. Gold is the one accent. Status colors are functional and
never decorative. **No red, ever** (DS-2) — attention is amber.

| Role | Name | Hex | Use |
|---|---|---|---|
| Primary | **Indigo** | `#4F6EF7` | "Tally", primary buttons/CTAs, active states, links, brand mark accents |
| Primary (deep) | Indigo Deep | `#3D5BD4` | hover, eyebrow labels, link hover |
| Accent | **Gold** | `#B8860B` | premium/accent moments, "recommended" highlights, dividers, editorial flourishes (text on light) |
| Accent (bright) | Gold Bright | `#D4A017` | accent ticks, the indigo→gold hairline, small highlights |
| Accent tint | Gold Tint | `#FBF6E9` | gold callout backgrounds |
| Ink | Ink | `#111827` | "Sunday", headings, body text |
| Text | Slate 600 | `#475569` | secondary body |
| Muted | Slate 400 | `#94A3B8` | captions, hints, footers |
| Border | Slate 200 | `#E2E8F0` | hairlines, card borders |
| Surface | White | `#FFFFFF` | cards, inputs, email body |
| Page | Off-white | `#FAFAFA` | app/page background |
| Success | Sage | `#22C55E` (text `#15803D`) | completed/positive only |
| Attention | Amber | `#F59E0B` (text `#B45309`) | needs-action/warning only |

**Signature gradient:** indigo → gold, `linear-gradient(90deg,#4F6EF7,#D4A017)`.
Use as a thin top rule (email header bar, section accents), not as a fill behind text.

**Retired:** Cyan `#06B6D4` is no longer a brand accent. It remains only as the
functional *Youth* ministry-category color in dashboards (alongside Adults `#4F6EF7`,
Kids `#8B5CF6`) — not part of brand expression.

**The app is light-only.** Design on white surfaces; do not introduce dark-mode
brand treatments.

---

## Typography

- **Fira Sans** (300–700) — all UI, headings, body.
- **Fira Code** (400–700) — every numeral, `tabular-nums`, for scan-friendly
  columns and stats (DS-4). Numbers are a product feature; set them in Fira Code.
- **Playfair Display** (900 italic) — editorial/display only ("Reveal thy
  numbers."), never in UI chrome or buttons.
- Headings: bold/extrabold, tight tracking (~`-0.01em`). Sentence case everywhere.

---

## Look & feel

Stark, engineered, trustworthy. Aggressive neutrality (grayscale, generous
whitespace) that gives way to purposeful color on interaction. Flat surfaces —
no gradients behind text, no heavy shadows, no neon. Numbers are the hero.

- Cards: white, `1px` slate-200 border, `12px` radius.
- Status by **shape + color**, never color alone (DS-18).
- Icons: clean line icons; **no emoji** in product or brand surfaces.

---

## Do / don't

- **Do** lead with the church's own numbers; specificity sells the value.
- **Do** keep indigo as the single primary CTA color; gold accents, never competes.
- **Don't** use red anywhere. **Don't** reintroduce cyan as a brand accent.
- **Don't** set numerals in Fira Sans. **Don't** Title Case or ALL CAPS.
- **Don't** ship user-facing copy without the VOICE.md pass (GROVE gate).
