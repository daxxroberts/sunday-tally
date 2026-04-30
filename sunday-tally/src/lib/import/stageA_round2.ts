/**
 * Stage A — Round 2 (loop-back clarification pass)
 *
 * After the user answers Round 1's clarification questions, the server sends
 * those answers back to Sonnet with the original mapping and asks: "based on
 * what they said, do you have follow-ups?" Sonnet replies with one of three
 * decisions:
 *   - 'proceed'    — answers are sufficient; move to Stage B
 *   - 'refine'     — generate new follow-up questions for a Round 2
 *   - 'reclarify'  — rewrite an existing question with clearer phrasing
 *
 * This delivers the conversational feel the user expected from V1.5 — Sonnet
 * actually engages with answers instead of one-shot routing.
 */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from '@/lib/ai/anthropic'

const ROUND_2_SYSTEM = `You are the SundayTally Decision Maker, in Round 2 of a clarification dialog with a church admin.

In Round 1, you produced clarification_questions about how to set up SundayTally for their data.
The admin has now answered those questions. Your job in Round 2 is to review the answers and
decide one of THREE outputs:

1. PROCEED — answers are sufficient. Move on to import. This should be your DEFAULT — most
   imports do NOT need Round 2 questions.

2. REFINE — generate up to 3 NEW follow-up questions ONLY when:
   - The admin picked an option (especially on q_pattern_audience_structure, meaning_code M1/M2/M3)
     that reveals an ambiguity NOT covered by the original questions.
   - The admin's answer suggests a routing decision that needs explicit confirmation.
   - The admin gave an unexpected text answer that contradicts the AI's default routing.

3. RECLARIFY — rewrite one or more original questions with clearer phrasing only if the admin
   appears to have misunderstood. Don't reclarify if they answered confidently.

STRICT RULES:
- DO NOT generate new questions to "seem helpful." Only when there is a real gap that affects routing.
- Non-blocking questions the admin left at the recommended default are NOT a signal to escalate.
- Use plain church language — Adults, Kids, Students/Teens — NEVER MAIN/KIDS/YOUTH internal codes.
- New questions get topic_group='pattern_verification' and id pattern q_round2_<topic>.
- Include meaning_code on choice options where the answer should drive deterministic routing.
- Maximum 3 new questions per round.
- Output exactly one tool call: propose_round_2.`

export interface Round2Result {
  decision:        'proceed' | 'refine' | 'reclarify'
  reasoning:       string
  new_questions:   Array<Record<string, unknown>>
  totalCents:      number
}

export async function runStageARound2(args: {
  supabase:        SupabaseClient
  churchId:        string
  proposedMapping: Record<string, unknown> | null
  qaAnswers:       Array<Record<string, unknown>>
}): Promise<Round2Result> {
  const userPrompt = [
    `Here is the mapping Round 1 produced:`,
    JSON.stringify(args.proposedMapping, null, 2),
    ``,
    `Here are the admin's answers to Round 1:`,
    JSON.stringify(args.qaAnswers, null, 2),
    ``,
    `Decide: proceed, refine, or reclarify. Call propose_round_2 exactly once.`,
  ].join('\n')

  const result = await runToolLoop({
    supabase:    args.supabase,
    churchId:    args.churchId,
    kind:        'import_stage_a',
    model:       'claude-sonnet-4-6',
    system:      [{ type: 'text', text: ROUND_2_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools:       [PROPOSE_ROUND_2_TOOL],
    handlers:    { propose_round_2: async (input) => input },
    terminateOn: ['propose_round_2'],
    maxTurns:    2,
    initialUser: userPrompt,
  })

  const out = result.finalToolCall?.input as Record<string, unknown> | undefined
  if (!out) {
    // Round 2 didn't terminate cleanly — default to proceed (don't block import on AI hiccup).
    return {
      decision:      'proceed',
      reasoning:     'Round 2 did not produce a tool call — proceeding with original answers.',
      new_questions: [],
      totalCents:    result.totalCents,
    }
  }

  const decision = (out.decision === 'refine' || out.decision === 'reclarify') ? out.decision : 'proceed'
  const newQuestions = Array.isArray(out.new_questions) ? out.new_questions as Array<Record<string, unknown>> : []

  return {
    decision:      decision as Round2Result['decision'],
    reasoning:     String(out.reasoning ?? ''),
    new_questions: decision === 'proceed' ? [] : newQuestions.slice(0, 3),
    totalCents:    result.totalCents,
  }
}

const PROPOSE_ROUND_2_TOOL: Anthropic.Messages.Tool = {
  name:        'propose_round_2',
  description: 'Decide whether to proceed to import, refine with new follow-up questions, or reclarify existing questions.',
  input_schema: {
    type: 'object',
    properties: {
      decision: {
        type: 'string',
        enum: ['proceed', 'refine', 'reclarify'],
        description: 'proceed = no follow-up needed; refine = add new questions; reclarify = rewrite existing.',
      },
      reasoning: {
        type: 'string',
        description: 'One sentence explaining the choice — shown to the admin if there are follow-ups.',
      },
      new_questions: {
        type: 'array',
        description: 'New questions for Round 2. Required for refine/reclarify, omit for proceed. Max 3.',
        items: {
          type: 'object',
          properties: {
            id:          { type: 'string', description: 'q_round2_<topic>' },
            blocking:    { type: 'boolean' },
            type:        { type: 'string', enum: ['text', 'choice'] },
            title:       { type: 'string' },
            context:     { type: 'string' },
            question:    { type: 'string' },
            topic_group: { type: 'string', description: "Always 'pattern_verification' for Round 2." },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label:        { type: 'string' },
                  explanation:  { type: 'string' },
                  meaning_code: { type: 'string', description: 'For deterministic routing.' },
                },
                required: ['label', 'explanation'],
              },
            },
            data_examples: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'blocking', 'type', 'title', 'question'],
        },
      },
    },
    required: ['decision', 'reasoning'],
  },
}
