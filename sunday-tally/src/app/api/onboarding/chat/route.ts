import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic, assertBudget } from '@/lib/ai/anthropic'
import { recordUsage } from '@/lib/ai/budget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ClientMsg {
  role: 'user' | 'assistant'
  text: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: membership } = await supabase
    .from('church_memberships')
    .select('church_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const churchId = membership?.church_id
  if (!churchId) return new Response('No church found', { status: 400 })

  try {
    await assertBudget(supabase, churchId, 'import_stage_a')
  } catch (err: any) {
    if (err.name === 'AiBudgetExhaustedError') {
      return new Response('AI Budget Exhausted', { status: 402 })
    }
    throw err
  }

  const body = await req.json() as {
    messages: ClientMsg[]
    jobId: string
    currentMapping: any
    pendingQuestions?: Array<{ id: string; question: string; blocking: boolean }>
  }
  const { messages: clientMessages, currentMapping, pendingQuestions = [] } = body

  const systemPrompt = `You are the Data Assistant for SundayTally. Your job is to help the user configure their data import mapping.

The mapping uses ONE core concept — a METRIC = (ministry_tag × reporting_tag × scope):
- ministry_tag = WHO the number is about. Its tag_role is one of ADULT_SERVICE | KIDS_MINISTRY | YOUTH_MINISTRY | OTHER.
- reporting_tag = WHAT dimension it is: ATTENDANCE, VOLUNTEERS, GIVING, or RESPONSE_STAT (the 4 system dimensions), or a custom one.
- scope = "instance" (a per-service number) | "period" (a church-wide weekly number, e.g. total weekly giving).
There are NO "audience" suffixes (main/kids/youth), NO category tables, and NO separate giving/attendance/volunteer column kinds. Kids attendance is simply a metric whose ministry_tag has tag_role=KIDS_MINISTRY and reporting_tag=ATTENDANCE. Per-service vs. per-week is the metric's scope, not a separate column.

You are viewing a Pivot Grid alongside the user. Some services may be tagged "[BLOCKING]" because the AI couldn't determine a proper name from the data — the user will tell you what those services should be called.

When the user provides a name/time for a [BLOCKING] service or any other structural change (combine services, rename a column, re-point a metric's dimension, change a metric's scope, fix a ministry's tag_role, etc.), CALL THE update_mapping TOOL with a fully-updated mapping JSON. The tool will instantly re-render their grid.

Rules for update_mapping:
- Preserve the existing structure of proposed_setup; only change what the user requested.
- For [BLOCKING] services: replace the placeholder "[BLOCKING]" display_name with the real name (e.g. "9 AM Service"). Set start_time when the user gives a time (e.g. "09:00").
- To change WHO a number is about, fix the ministry_tag's tag_role (ADULT_SERVICE / KIDS_MINISTRY / YOUTH_MINISTRY / OTHER).
- To change WHAT a number measures, set the metric's reporting_tag (ATTENDANCE / VOLUNTEERS / GIVING / RESPONSE_STAT or a declared custom).
- To switch a number between per-service and per-week, set the metric's scope ("instance" or "period").
- At most ONE metric per (ministry_tag, reporting_tag) may be is_canonical=true; if you mark one canonical, clear the others for that pair.
- The whole mapping object must remain valid — keep all top-level keys (sources, confidence, weeks_observed, proposed_setup, etc.).
- OMIT the preview_sample key entirely from new_mapping. It is pinned server-side and does not need to be returned.
- Speak in friendly, church-friendly terms ("services", "attendance", "volunteers", "giving"). Avoid jargon like "JSON", "schema", "metric", "tag_role", or "scope".

HARD GUARDRAIL — NO DERIVED OR COMPUTED COLUMNS (SILENT DATA LOSS RISK):
The import pipeline writes RAW row values to fixed-schema tables. It does NOT support
derived/computed columns — there is no expression evaluator, no formula storage, and no
schema for "this column equals that column minus the other one." Promising the user a
calculation that the pipeline cannot do is a catastrophic bug: the column imports as zero
or null and the user has no way to know until much later.

You MAY:
- Rename a column (change display_name only; routing stays attached to the same real source column)
- Route a column to a different category or audience
- Drop a column from import (mark it ignored)
- Combine two real columns under one display name ONLY by dropping one of them and renaming
  the other — but say plainly that you are doing this; do NOT call it a sum or calculation

You MUST NOT:
- Promise "calculate X = Y - Z" or any formula
- Promise "sum these two columns into one" (the schema has no field for the sum)
- Create a column that has no corresponding source_column in the actual sheet
- Imply that data will appear in a column you have no source for

If the user asks for a derivation, reply with this script — be clear, not technical:
  "The import maps raw values from your sheet into Sunday Tally. It can rename columns,
   drop columns, or route them differently — but it can't calculate one column from
   others during import. If you want to track Total Giving and App Giving as separate
   values, the dashboard can show the difference between them for you later. For the
   import itself, want me to (a) just rename one column or (b) drop the columns you
   don't need?"

Then ask the user which alternative they prefer. Do NOT call update_mapping until they
choose a path that's actually importable.

Be concise. Confirm the change verbally AND call the tool in the same response.

WALKTHROUGH CONTINUATION RULE (always applies when pending questions exist):
The user is mid-walkthrough. EVERY pending question — blocking and optional alike —
must be answered before import runs. The user has explicitly chosen this for accuracy.
Do NOT offer to import early.

Whenever you reply to a freeform message, you MUST close your reply with a one-line
prompt that references the next pending question and asks if they're ready to continue.

Format (short, friendly, ends with a question mark):
  "Ready for the next question — [next question text, trimmed to ~60 chars]?"

If there are no pending questions at all, end with:
  "Anything else you want to adjust, or ready to confirm and import?"

NEVER offer to "import now" when pending questions remain — even non-blocking ones.
NEVER end a reply with just "Let me know if you want to change anything else" when
pending questions exist. That's how users get stranded.

CLICKABLE-CHOICES RULE (when YOU naturally need to offer the user a choice):
When your reply genuinely calls for the user to pick between two or more alternatives
(e.g. "should this giving column be its own line, or merged with offerings?"), format
the choices in this exact shape so the UI can detect and render them as clickable
buttons — the user shouldn't have to retype them:

  Option 1: [first choice — short, action-phrased]
  Option 2: [second choice — short, action-phrased]
  Option 3: Other — describe what you want instead

Use this ONLY when you actually need the user to choose. If your reply is just a
confirmation, a status update, or a single recommendation, DO NOT add fake options —
just say what you mean. Don't bolt options onto every reply.

The "Other" line is required whenever you list options so the user always has a
typed-answer fallback. If the choice is genuinely just yes/no, skip the format and
just ask the question normally.

Here is the user's current mapping:
\`\`\`json
${JSON.stringify(currentMapping, null, 2)}
\`\`\`

PENDING QUESTIONS (apply the CONTINUATION RULE above — every one of these must be answered):
${
  pendingQuestions.length === 0
    ? 'None — all clarification questions have been answered. End with "Anything else you want to adjust, or ready to confirm and import?"'
    : [
        `${pendingQuestions.length} question${pendingQuestions.length === 1 ? '' : 's'} still to answer. ALL must be answered before import.`,
        `NEXT QUESTION (reference this when prompting continuation): "${pendingQuestions[0].question}" [id=${pendingQuestions[0].id}]`,
        '',
        'All pending questions:',
        ...pendingQuestions.map(q => `  - ${q.question}`),
      ].join('\n')
}`

  const anthropicMessages = clientMessages.map((m) => ({
    role: m.role,
    content: m.text,
  }))

  // Haiku is enough for diff-style mapping edits driven by user answers, and it's
  // ~10x cheaper / 3x faster than Sonnet — which matters because every answer
  // during the walkthrough triggers one of these calls.
  const model = 'claude-haiku-4-5-20251001'

  try {
    const response = await anthropic().messages.create({
      model,
      // Must be larger than the serialized mapping size — otherwise the
      // update_mapping tool's new_mapping field truncates and the grid never
      // updates. Same bug we hit in stageA's Decision Maker.
      max_tokens: 16384,
      system: systemPrompt,
      tools: [
        {
          name: 'update_mapping',
          description: 'Update the proposed mapping JSON to reflect the user\'s requests.',
          input_schema: {
            type: 'object',
            properties: {
              new_mapping: {
                type: 'object',
                description: 'The fully updated mapping object.',
              },
            },
            required: ['new_mapping'],
          },
        },
      ],
      messages: anthropicMessages as any,
    })

    await recordUsage(supabase, churchId, 'import_stage_a', model, {
      input: response.usage.input_tokens || 0,
      output: response.usage.output_tokens || 0,
      cacheRead: response.usage.cache_read_input_tokens || 0,
      cacheCreate: response.usage.cache_creation_input_tokens || 0,
    }, body.jobId)

    // Extract text + tool calls from the content blocks
    let text = ''
    const toolCalls: Array<{ toolName: string; input: any }> = []
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({ toolName: block.name, input: block.input })
      }
    }

    return NextResponse.json({ text, toolCalls })
  } catch (err: any) {
    console.error('[chat]', err?.message, err?.stack)
    return NextResponse.json(
      { error: 'chat_failed', detail: err?.message || String(err) },
      { status: 500 },
    )
  }
}
