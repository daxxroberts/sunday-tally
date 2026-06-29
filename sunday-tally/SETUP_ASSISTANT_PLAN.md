# Setup Assistant — Scoping (open build item, future enhancement)

Status: **NOT BUILT — scoping only.** Captured 2026-06-29. Listed on the website's
"Upcoming features" by Daxx. This doc records the vision, what already exists, the
safety gaps, and a proposed phased build so it can be picked up later.

---

## The vision

A pastor describes their church ("we have a main service at 9 and 11, a kids
ministry, a youth night on Wednesday, and we take giving once a week") and the
**Setup Assistant**:

1. **Proposes** a complete, correct Sunday Tally setup — the ministry tree (top-level
   vs. groups), the four metric types per ministry, the scope (per-service vs.
   church-wide), and the grand-total rules.
2. **Renders a preview** of exactly how it will look — the What We Track tree and the
   resulting dashboard (cards, colors, headline grand total).
3. On **approval**, **applies** it to their church **without breaking anything they've
   already set up** (idempotent; merges rather than duplicates; never orphans).

It is grounded in the same knowledge base the Field Notes "Sunday Tally Setup" posts
are written from — so the content work and this feature reinforce each other.

## What already exists (the building blocks)

- **Ground-truth knowledge base:** `docs/what-we-track-knowledge-base.md` (now incl.
  grand totals), `TOTALS_RULES_PLAN.md`, `FEATURE_INVENTORY.md`, the schema. Enough to
  propose an accurate setup.
- **Idempotent writers:** `src/lib/import/writers.ts` `upsert_*` handlers key on
  `(church_id, code)` UNIQUE — re-applying the same structure makes **zero duplicates**.
  `addCount()` (`settings/track/actions.ts`) has a canonical guard for attendance.
- **The propose → preview → approve pattern, proven twice:**
  - CSV **import**: AI Stage A proposes a mapping → user confirms → deterministic
    Stage B writes via the `upsert_*` handlers (the AI never writes the DB directly).
  - **Widget Builder**: build → preview the chart → `save_widget`, with a gate that
    refuses unpreviewed specs.
- **Owner/admin gating** on all structure-creating actions.

## The gaps (what makes "apply without breaking" unsafe today)

1. **No setup diff / dry-run.** Nothing computes, against the church's *existing*
   structure, "will ADD these / already EXISTS (skip) / CONFLICTS (ask)". A blind
   apply on a partly-set-up church is the core risk.
2. **Renames orphan.** Codes derive from names; rename a ministry/metric and the new
   code won't match the old → old row orphaned, new one created, **no auto-merge**.
3. **Non-canonical custom metrics can duplicate;** roll-up inheritance
   (`inheritRollupsFromParent`) can double-link if run twice.
4. **No AI surface writes setup.** Analytics chat + widget builder are read-only /
   widget-only; import's AI only *proposes*. There is no conversational
   "set up my church" that creates the What We Track structure.

## Proposed build (phased)

- **P1 — Setup spec + proposer.** Define a `ChurchSetupSpec` (ministries, nesting,
  metric types, scope, grand-total rules). An AI proposer produces it, grounded in the
  KB. Read-only; output is data, not writes.
- **P2 — Preview render.** Render the proposed tree + dashboard + grand total
  (reuse the import-Stage-A / widget build-preview pattern). Pastor reviews.
- **P3 — Diff/dry-run vs existing (the safety layer).** Compare spec to the live church:
  new / exists / conflict. Surface it as the approval screen. **This is the crux of
  "won't break anything."**
- **P4 — Idempotent apply + merge path.** Apply via the existing `upsert_*` writers;
  add a merge path for renames (relink orphans) and guards against dup roll-ups /
  non-canonical dups. Owner-gated, explicit confirm, reversible where possible.
- **P5 — Dedicated "Setup Assistant" surface.** A new AI surface (separate from the
  data-focused analytics assistant) running propose → preview → diff → apply.

## Risks / principles

- **Non-destructive by default.** Never delete or overwrite existing structure on apply;
  add + merge only. A church that's already set up must come through untouched except
  for explicitly-approved additions.
- **Diff before write, always.** No apply without a reviewed diff.
- **Reuse, don't reinvent** the idempotent writers and the preview gate.
- Sits behind owner/admin auth; honors the Six Critical DB Rules.
