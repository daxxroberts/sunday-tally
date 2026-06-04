# Sub-Agent Operating Standard (SAOS)
Version 1.0 · 2026-06-03 · SundayTally / BOT team

The rule for how sub-agents are briefed, gated, and reported — so no agent drifts
from project context and every output lands in a known, safe state. The orchestrating
session ("the brain") MUST apply this whenever it dispatches one or more sub-agents.
If the brain would have to explain context verbally, that context belongs in the
agent's Context Header instead.

---

## 0. When to use sub-agents

USE them for: parallelizable work over **disjoint files**, broad search/triage,
heavy multi-file builds, independent verification (FELIX/LENS/SAGE), or anything
that would otherwise bloat the brain's context.

DON'T use them for: a single-file edit the brain can do directly, a one-fact lookup,
or any decision the Builder must make (see §5).

---

## 1. The Context Header — REQUIRED in every sub-agent prompt

Every dispatched agent prompt MUST open with this block, filled in. No exceptions.

```
ROLE: <BOT agent name or function, e.g. "FELIX — code validation">
PROJECT: SundayTally — multi-tenant church-analytics SaaS.
  Stack: Next.js (App Router) · TypeScript · Supabase · Vercel · Tailwind.
  Tag-first schema (Solution A) is LIVE (migrations 0022–0029).

READ FIRST (in this order, before any edit — no skimming):
  - SCHEMA_CUTOVER_STATUS.md  (decisions D-072…D-098 — the source of truth)
  - DESIGN_SYSTEM.md          (DS-1…DS-25 — binding UI rules)
  - <relevant IRIS_*_ELEMENT_MAP.md for the screen>
  - QUERY_PATTERNS.md         (before writing ANY query)
  - SESSION_HANDOFF_2026-06-03.md  (current open scope)

SIX CRITICAL DB RULES (never violate):
  1. Always WHERE status='active' (never include cancelled occurrences)
  2. Dashboard groups by tag_code (never display_name)
  3. Volunteer totals are calculated, never stored
  4. NULL ≠ zero attendance (never COALESCE(attendance,0) in averages)
  5. Always SUM giving_entries per occurrence (multiple rows per source)
  6. Tags are pre-stamped in service_occurrence_tags (never re-derive at query time)

HARD CONSTRAINTS (sealed — apply to ALL agents):
  - NO database mutations. NO applying migrations. Write migration FILES only and
    flag them NEEDS-APPROVAL. The brain applies migrations through the BOT gate
    with explicit per-action Builder authorization.
  - NO creating external accounts (Stripe/Resend/etc.), NO handling credentials,
    API keys, secrets, or env values. Those are the Builder's to do.
  - Any test write to live/demo data MUST be reverted (prefer a transaction that
    RAISEs/ROLLBACKs so nothing persists; otherwise delete what you inserted and
    prove 0 leftover rows).
  - STAY ON-BRANCH and UNCOMMITTED. Never git commit, never push. The brain owns
    commit strategy.
  - "Wire it up" = smallest-viable REAL integration, not a sandboxed preview with
    mocks. Preview is scope-laundering when the instruction is clear.
  - STOP-AND-FLAG, don't guess: if the work touches navigation, folder structure,
    schema, role permissions, UI copy, query logic, or a decision spanning >1 file
    that isn't already locked in a D-xxx / IRIS map — add it to BUILD_FLAGS.md and
    return it as a flag instead of inventing an answer.

FILE SCOPE (you may edit ONLY these):
  <explicit list of allowed files/dirs — chosen to be DISJOINT from sibling agents>

TASK:
  <precise instruction + acceptance criteria>

ON FINISH, RETURN THIS STRUCTURED REPORT (see §4).
```

---

## 2. Orchestration rules

- **Partition by disjoint files.** Agents running in parallel must not share an
  editable file. If two tasks both need file X, either merge them into one agent or
  sequence them. Use worktree isolation ONLY when parallel mutation of the same files
  is unavoidable (it splits the tree and complicates a single commit).
- **One tree, one commit.** Default to all agents writing the main working tree so the
  brain can land a single clean commit. (Per Builder preference: "one final commit push.")
- **BOT gate is mandatory before "done":**
  - Code change → FELIX validates (against IRIS map + build/typecheck).
  - UI/rendered change → LENS live-render verification.
  - Data/schema → STRATA/SCHEMA review; migration FILE only, never applied by agent.
  - The brain reviews ACTUAL files + runs typecheck/build. Agent self-report is never
    sufficient on its own.
  - SAGE ratifies the batch before commit. Nothing ships without SAGE.

---

## 3. Brain responsibilities (the orchestrating session)

1. Decompose work into disjoint-file tracks; write each agent's Context Header.
2. Dispatch + monitor (Workflow /workflows or background Agents).
3. On return: read the real diffs, run `tsc`/build, restore any stray test data,
   confirm each flag.
4. Consolidate all agent reports into ONE summary (§4 aggregate).
5. Separate the Builder's "Your Turn" list (§5) — never bury external/decision items.
6. Tee up (and, on Builder go, execute) the single commit. Never push to a default
   branch; branch first if needed.

---

## 4. Required report format (every agent returns this)

```
SUMMARY: <1–2 lines: what you did>
FILES CHANGED: <path — what changed> (one per line; "none" if discovery-only)
VALIDATION: <tsc/build/test/LENS result, or "not run — why">
RESIDUALS: <anything left imperfect, with severity>
FLAGS (NEEDS-APPROVAL / BUILD_FLAGS): <decisions or blocked items for the Builder/brain>
TEST-DATA: <"none" or "wrote X, reverted, 0 leftover verified">
```

The brain aggregates these into: **Done · Residual · Your-Turn.**

---

## 5. The "Your Turn" handoff — always separated for the Builder

These are NEVER done by agents and must be surfaced explicitly every batch:
- Creating external accounts / obtaining keys (Stripe, Resend, …).
- Setting env values / secrets / redirect URLs / email templates in dashboards.
- Authorizing + applying any migration to production (per-action approval).
- Final go on commit/push and on any flagged navigation/schema/role/copy decision.

---

## 6. Precedent

This standard codifies what was already enforced ad hoc this session: the migration
0028/0029 BOT gate (FELIX validate → empirical test → SAGE ratify → brain applies with
explicit auth), the "agents write migration files, never apply" rule, test-write
reversal (the rolled-back viewer-impersonation test for D-098), and "wire-it-up =
integration, not preview." See SCHEMA_CUTOVER_STATUS.md D-090, D-098 and memory
feedback_* entries.
```
