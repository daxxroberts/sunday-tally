/**
 * Shared PatchOp applier — the SINGLE source of truth for how a clarification
 * answer mutates a `proposed_setup` (IR v2, metric-centric; see IMPORT_IR_V2.md
 * §"Clarification + patch model" → "PatchOp mutation semantics").
 *
 * This module is imported by BOTH:
 *   - `reconcile_answers.ts` (server-side, deterministic reconcile before Stage B), and
 *   - the client walkthrough (review page) — the two MUST NOT diverge.
 *
 * Therefore it is intentionally PURE and framework-agnostic:
 *   - no Supabase, no React, no Node-only APIs;
 *   - the only side-effect is the in-place mutation of the passed `proposedSetup`
 *     (and an optional `console.warn` when an id is not found).
 *
 * MUTATION CONTRACT: `applyPatchOp` mutates `proposedSetup` IN PLACE and returns
 * `void`. Callers that need immutability must clone before calling. (reconcile_answers
 * deep-clones the whole ConfirmedMapping up front; the client walkthrough clones the
 * mapping per answer.)
 *
 * Missing id (ministry_code / metric_code / service_code not found) → no-op
 * (console.warn, never throw), per the contract.
 */

import type { PatchOp, ProposedSetup } from './stageA_validate'

/**
 * Apply a single PatchOp to `proposedSetup`, mutating it in place.
 *
 * @param proposedSetup  the IR v2 proposed_setup; mutated in place.
 * @param patchOp        the discriminated-union op (or undefined → no-op).
 * @param answerValue    the selected option's value: a tag_role, a reporting tag
 *                       code, 'instance'|'period', a display name, or a time.
 *                       Unused by ops that don't read a value (set_metric_canonical,
 *                       record_answer_only).
 */
export function applyPatchOp(
  proposedSetup: ProposedSetup,
  patchOp: PatchOp | undefined,
  answerValue?: string,
): void {
  if (!patchOp || !proposedSetup) return

  switch (patchOp.kind) {
    // ── set_ministry_tag_role { ministry_code } + value = <ROLE> ──
    case 'set_ministry_tag_role': {
      const tag = (proposedSetup.ministry_tags ?? []).find(
        t => t.code === patchOp.ministry_code,
      )
      if (!tag) {
        console.warn(
          `[applyPatchOp] set_ministry_tag_role: ministry_code "${patchOp.ministry_code}" not found — no-op.`,
        )
        return
      }
      if (answerValue == null) return
      tag.tag_role = answerValue
      return
    }

    // ── set_metric_canonical { metric_code }: mark this canonical, clear siblings ──
    // (every other metric sharing the same (ministry_tag, reporting_tag) → false)
    case 'set_metric_canonical': {
      const metrics = proposedSetup.metrics ?? []
      const target = metrics.find(m => m.metric_code === patchOp.metric_code)
      if (!target) {
        console.warn(
          `[applyPatchOp] set_metric_canonical: metric_code "${patchOp.metric_code}" not found — no-op.`,
        )
        return
      }
      target.is_canonical = true
      for (const m of metrics) {
        if (m.metric_code === target.metric_code) continue
        if (
          m.ministry_tag === target.ministry_tag &&
          m.reporting_tag === target.reporting_tag
        ) {
          m.is_canonical = false
        }
      }
      return
    }

    // ── set_metric_scope { metric_code } + value = 'instance' | 'period' ──
    case 'set_metric_scope': {
      const metric = (proposedSetup.metrics ?? []).find(
        m => m.metric_code === patchOp.metric_code,
      )
      if (!metric) {
        console.warn(
          `[applyPatchOp] set_metric_scope: metric_code "${patchOp.metric_code}" not found — no-op.`,
        )
        return
      }
      if (answerValue !== 'instance' && answerValue !== 'period') return
      metric.scope = answerValue
      return
    }

    // ── set_metric_reporting_tag { metric_code } + value = <CODE> ──
    case 'set_metric_reporting_tag': {
      const metric = (proposedSetup.metrics ?? []).find(
        m => m.metric_code === patchOp.metric_code,
      )
      if (!metric) {
        console.warn(
          `[applyPatchOp] set_metric_reporting_tag: metric_code "${patchOp.metric_code}" not found — no-op.`,
        )
        return
      }
      if (answerValue == null) return
      metric.reporting_tag = answerValue
      return
    }

    // ── set_template_display_name { service_code } + value = name ──
    case 'set_template_display_name': {
      const tpl = (proposedSetup.service_templates ?? []).find(
        t => t.service_code === patchOp.service_code,
      )
      if (!tpl) {
        console.warn(
          `[applyPatchOp] set_template_display_name: service_code "${patchOp.service_code}" not found — no-op.`,
        )
        return
      }
      if (answerValue == null) return
      tpl.display_name = answerValue
      return
    }

    // ── set_template_start_time { service_code } + value = time ──
    case 'set_template_start_time': {
      const tpl = (proposedSetup.service_templates ?? []).find(
        t => t.service_code === patchOp.service_code,
      )
      if (!tpl) {
        console.warn(
          `[applyPatchOp] set_template_start_time: service_code "${patchOp.service_code}" not found — no-op.`,
        )
        return
      }
      if (answerValue == null) return
      tpl.start_time = answerValue
      return
    }

    // ── record_answer_only: advisory context only, no mutation ──
    case 'record_answer_only':
      return

    default: {
      // Exhaustiveness guard: if a new PatchOp kind is added to the union without
      // a handler here, TypeScript flags this assignment at compile time.
      const _exhaustive: never = patchOp
      void _exhaustive
      return
    }
  }
}
