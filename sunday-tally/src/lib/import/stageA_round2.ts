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

1. PROCEED — answers are complete and unambiguous. Move on to import with no follow-ups.
   Use this ONLY when all blocking answers are clear AND no routing decision opens new ambiguity.

2. REFINE — generate up to 3 NEW follow-up questions when ANY of the following apply:
   - The admin answered the structure question (M1/M2/M3). This almost always opens follow-ups:
       M3 selected → ask how many distinct Sunday service "slots" there are (1 slot with
                      simultaneous rooms, or 2+ slots at different times?).
       M1 selected → confirm whether Kids and Students are really IN the same room or in
                      separate rooms running at the same time.
       M2 selected → confirm which day/time each group meets (e.g. adults Sunday, students Wednesday).
   - Service names were provided for the first time → confirm the names match what shows on screen
     (spelling, capitalisation) and ask which service is the "primary" if applicable.
   - Start times were provided → confirm AM/PM interpretation was correct (e.g. "9:00" really is 9am).
   - The giving scope answer was GIVING_MIXED → ask which specific sources are per-service vs weekly.
   - Any blocking question received a free-text answer that is vague or could mean multiple things.

3. RECLARIFY — rewrite one or more original questions with clearer phrasing ONLY if the admin
   appears to have misunderstood the question (contradictory answer, "I don't know", etc.).

RULES:
- Use plain church language — Adults, Kids, Students/Teens — NEVER internal codes like MAIN/KIDS/YOUTH.
- New questions get topic_group='pattern_verification' and id pattern q_round2_<topic>.
- Include meaning_code on choice options where the answer drives deterministic routing.
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
  jobId?:          string | null
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
    jobId:       args.jobId,
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
