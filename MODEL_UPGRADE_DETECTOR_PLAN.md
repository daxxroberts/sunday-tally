# Model-Upgrade Detector — Plan (task #68, Tier 1: notify-only)
Owner: CIRCUIT/NOVA · 2026-06-06 · status: PROPOSED (design only — not built)

Grounded in the actual code: `src/lib/ai/pricing.ts` (the `AiModel` union + `RATES`),
`src/lib/ai/anthropic.ts` (single SDK client, `runToolLoop`), and the model policy
(default **latest Sonnet**; Opus dormant, reachable only via the
`IMPORT_PATTERN_READER_MODEL` env override).

---

## 1. Goal
When Anthropic ships a newer model in a family we use (Sonnet / Haiku / Opus),
**notify the Builder** so the model constant + pricing row can be reviewed and
bumped deliberately. **Tier 1 = detect + notify only. No auto-switch** — model
changes stay a human decision (pricing, tokenizer shifts, behavior regressions all
need eyes; see the Opus-4.7 tokenizer note in `pricing.ts`).

Non-goals (later tiers): Tier 2 = staged A/B of a candidate model behind a flag;
Tier 3 = self-healing auto-upgrade with rollback. This doc is Tier 1.

---

## 2. Source of truth for "what models exist"
Anthropic exposes a **Models API**: `GET /v1/models` (SDK: `anthropic().models.list()`),
returning `{ id, display_name, created_at }` for every model the key can call.
This is the authoritative, no-scrape signal. (If the SDK version lacks `.models`,
call the REST endpoint with the same key — confirm at build time, don't assume.)

## 3. What we compare against
Our "currently configured" models = the `AiModel` union literals in `pricing.ts`
plus any env override (`IMPORT_PATTERN_READER_MODEL`, chat/import model env if added).
Parse each into **{ family, version, date-suffix }**:
- `claude-sonnet-4-6` → family `sonnet`, version `4-6`
- `claude-haiku-4-5-20251001` → family `haiku`, version `4-5`, snapshot `20251001`
- `claude-opus-4-7` → family `opus`, version `4-7`

A model from `/v1/models` is an **upgrade candidate** when, for a family we use,
its (version, snapshot) sorts AFTER our configured one. Sorting: compare the numeric
version tuple first (`4-7` > `4-6`), then the date snapshot.

## 4. Detector (Tier 1)
A scheduled server job (Vercel Cron → an API route, e.g. `GET /api/admin/model-check`,
or a `scheduled-tasks` entry) runs **weekly**:
1. `anthropic().models.list()`.
2. For each family in use, find the newest available id.
3. If newer than configured → build a finding `{ family, current, candidate, candidateReleased }`.
4. De-dupe against the last-notified set (store in a tiny `system_flags` row or a
   `model_upgrade_state` jsonb) so we notify ONCE per new model, not weekly forever.
5. Notify (see §5). No code is changed by the job.

Guardrails:
- Read-only against Anthropic; no model is ever switched by the job.
- Locked to the same `ANTHROPIC_API_KEY`; the route is admin-only / cron-secret-gated
  (server-only, never client-reachable).
- Failure is silent + logged (a flaky models call must never break anything).

## 5. Notify channel (Tier 1)
Per `EMAIL_POLICY.md`, an operational/infra alert to the Builder (not a church user)
is an **internal notification**, not a church-facing email. Options, simplest first:
- **In-app admin banner** on an internal/owner surface (a `system_flags` row the app
  reads) — no new infra. **Recommended for MVP.**
- Optional: a single Resend email to the Builder address, OR a Slack message via the
  connected Slack MCP, if push is wanted. Gate behind an env so it's opt-in.

Notification copy = neutral + actionable: "Newer model available: `claude-sonnet-4-7`
(released 2026-…). Current: `claude-sonnet-4-6`. Review pricing + behavior, then bump
the `AiModel` constant + add its `RATES` row." Link to this doc.

## 6. Files (when built)
- `src/lib/ai/modelRegistry.ts` — parse/compare model ids (family/version/snapshot);
  export `configuredModels()` (reads the `AiModel` union + env overrides) and
  `findUpgrades(available, configured)`. Pure + unit-testable.
- `src/app/api/admin/model-check/route.ts` — the cron-gated job (list → compare →
  de-dupe → notify). Cron-secret or admin-session gated.
- Storage: a `model_upgrade_state` jsonb (system-level) or reuse an existing
  settings/flags row — **decide at build (FLAG):** no per-church scope (this is global).
- `vercel.ts` cron entry (weekly) OR a `scheduled-tasks` registration.

## 7. The pricing coupling (important)
A new model MUST get a `RATES` row before it's selected, or `tokensToCents` throws
("Unknown AI model"). So the notification explicitly reminds: **add the `RATES` row in
the same change as the constant bump.** Tier 1 never auto-selects, so this stays safe.

## 8. Open decisions
1. Cadence — weekly (lean) vs daily? Weekly is plenty for a notify-only signal.
2. Channel — in-app banner only (MVP) vs also Resend/Slack push?
3. State storage — new `model_upgrade_state` row vs fold into an existing flags row?
4. Scope of "families in use" — just the defaults (sonnet/haiku), or also watch opus
   since it's reachable via env? (Lean: watch every family present in `AiModel`.)

## 9. Gate
CIRCUIT review (agentic/infra), FELIX (the compare logic + the throw-on-missing-RATES
coupling), SAGE before any cron ships. Per SUBAGENT_STANDARD if built via sub-agents.
Tier 1 ships no behavior change to churches — lowest-risk increment.
