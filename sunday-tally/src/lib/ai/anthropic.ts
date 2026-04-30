import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRemaining, recordUsage, type AiBucket, type AiRequestKind } from './budget'
import type { AiModel, UsageTokens } from './pricing'

let _client: Anthropic | null = null

export function anthropic(): Anthropic {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey: key })
  return _client
}

export class AiBudgetExhaustedError extends Error {
  constructor(public readonly bucket: AiBucket) {
    super('ai_budget_exhausted')
    this.name = 'AiBudgetExhaustedError'
  }
}

/** Throws if the relevant bucket is at or below zero cents. */
export async function assertBudget(
  supabase: SupabaseClient,
  churchId: string,
  kind: AiRequestKind,
): Promise<void> {
  const remaining = await getRemaining(supabase, churchId, kind)
  if (remaining <= 0) {
    throw new AiBudgetExhaustedError(kind === 'analytics_chat' ? 'analytics' : 'setup')
  }
}

export interface ToolHandlerContext {
  churchId:  string
  supabase:  SupabaseClient
  signal?:   AbortSignal
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx:   ToolHandlerContext,
) => Promise<unknown>

export interface RunToolLoopArgs {
  supabase:    SupabaseClient
  churchId:    string
  kind:        AiRequestKind
  model:       AiModel
  system:      string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>
  tools:       Anthropic.Messages.Tool[]
  handlers:    Record<string, ToolHandler>
  /** Final tool name that terminates the loop (e.g. 'done', 'final_answer'). */
  terminateOn?: string[]
  maxTurns?:    number
  initialUser:  string | Anthropic.Messages.ContentBlockParam[]
  /** Invoked after each assistant turn with delta text for streaming surfaces. */
  onAssistantText?: (text: string) => void
  /** Invoked for each tool result payload after a handler returns. */
  onToolResult?: (toolName: string, result: unknown) => void
}

export interface RunToolLoopResult {
  finalText:      string
  finalToolCall?: { name: string; input: Record<string, unknown> }
  totalCents:     number
  turns:          number
}

/**
 * Server-side tool-use loop. Each turn:
 *   1. Check budget. Throws AiBudgetExhaustedError if exhausted.
 *   2. Call Claude.
 *   3. Record usage against the bucket.
 *   4. For every tool_use block, invoke its handler (churchId is injected
 *      server-side — the model never provides it).
 *   5. Break when stop_reason === 'end_turn' or a terminateOn tool is called.
 */
export async function runToolLoop(args: RunToolLoopArgs): Promise<RunToolLoopResult> {
  const {
    supabase, churchId, kind, model, system, tools, handlers,
    terminateOn = [], maxTurns = 12, initialUser,
    onAssistantText, onToolResult,
  } = args

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: typeof initialUser === 'string'
        ? [{ type: 'text', text: initialUser }]
        : initialUser,
    },
  ]

  let totalCents = 0
  let finalText  = ''
  let finalToolCall: RunToolLoopResult['finalToolCall'] = undefined

  for (let turn = 0; turn < maxTurns; turn++) {
    await assertBudget(supabase, churchId, kind)

    const response = await anthropic().messages.create({
      model,
      max_tokens: 4096,
      system,
      tools,
      messages,
    })

    const usage: UsageTokens = {
      input:       response.usage.input_tokens        ?? 0,
      output:      response.usage.output_tokens       ?? 0,
      cacheRead:   response.usage.cache_read_input_tokens     ?? 0,
      cacheCreate: response.usage.cache_creation_input_tokens ?? 0,
    }
    const { cents } = await recordUsage(supabase, churchId, kind, model, usage)
    totalCents += cents

    // Collect assistant content
    const assistantContent = response.content
    let turnText = ''
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = []
    for (const block of assistantContent) {
      if (block.type === 'text') {
        turnText += block.text
      } else if (block.type === 'tool_use') {
        toolUses.push({
          id:    block.id,
          name:  block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        })
      }
    }
    if (turnText) {
      finalText += turnText
      onAssistantText?.(turnText)
    }

    messages.push({ role: 'assistant', content: assistantContent })

    if (toolUses.length === 0) {
      if (response.stop_reason === 'end_turn') break
      // Unexpected stop without tool calls — surface what we have.
      break
    }

    // Run handlers (server injects churchId — AI never provides it).
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const handler = handlers[tu.name]
      if (!handler) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          is_error: true,
          content: `Unknown tool: ${tu.name}`,
        })
        continue
      }
      try {
        const result = await handler(tu.input, { churchId, supabase })
        onToolResult?.(tu.name, result)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result ?? null),
        })
        if (terminateOn.includes(tu.name)) {
          finalToolCall = { name: tu.name, input: tu.input }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Handler error'
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          is_error: true,
          content: message,
        })
      }
    }

    messages.push({ role: 'user', content: toolResults })

    if (finalToolCall) break
  }

  return { finalText, finalToolCall, totalCents, turns: messages.length }
}
