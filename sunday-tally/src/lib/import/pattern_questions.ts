/**
 * Pattern-Confirmation Question Library — V1.5-Δ6
 *
 * Server-templated, deterministic clarification questions that are inserted at
 * the TOP of clarification_questions before the user reaches the confirm UI.
 *
 * Each entry asks the user to confirm a fact the Pattern Reader detected,
 * BEFORE the user is asked any routing question. Pattern questions are
 * tagged topic_group='pattern_verification' so the UI can render them in a
 * distinct section.
 *
 * Library is versioned with the AI Onboarding Standard. See
 * AI_ONBOARDING_STANDARD_V1_5.md for the design rationale.
 */
import type { PatternReport } from './stageA_pattern'

export interface PatternQuestion {
  id:               string
  blocking:         boolean
  type:             'text' | 'choice'
  topic_group:      'pattern_verification'
  title:            string
  context:          string
  question:         string
  options?:         Array<{ label: string; explanation: string; meaning_code?: string }>
  data_examples?:   string[]
}

interface ServiceTemplate {
  display_name?: string
  service_code?: string
  primary_tag?:  string
}

interface ProposedSetup {
  service_templates?: ServiceTemplate[]
}

/**
 * Generate the pattern-confirmation questions for a given source set.
 * Inputs:
 *   - patternReports: the per-source PatternReports from the Pattern Reader
 *   - proposedSetup:  Stage A's proposed_setup (if available — may be partial)
 * Output: ordered list of pattern questions to prepend to clarification_questions.
 */
export function generatePatternQuestions(
  patternReports: Array<{ sourceName: string; report: PatternReport | null }>,
  proposedSetup?: ProposedSetup,
): PatternQuestion[] {
  const questions: PatternQuestion[] = []

  // ── Q-PAT-2: Service count confirmation ──────────────────────────────────
  // Fires when ≥2 templates were proposed. Confirms the user's services match
  // what the AI inferred (no missing, no extras, names correct).
  const templates: ServiceTemplate[] = proposedSetup?.service_templates ?? []
  if (templates.length >= 2) {
    const names = templates
      .map(t => t.display_name ?? t.service_code ?? '(unnamed)')
      .filter(n => !n.includes('[BLOCKING]'))   // skip if Sonnet flagged opaque codes — q_service_names handles that
    if (names.length >= 2) {
      questions.push({
        id:           'q_pattern_service_count',
        blocking:     false,
        type:         'choice',
        topic_group:  'pattern_verification',
        title:        `Confirm ${templates.length} services detected`,
        context:      `We found ${templates.length} services in your data: ${names.join(', ')}.`,
        question:     `Does this list match your church's services?`,
        options: [
          { label: 'Yes — these match', explanation: 'Use exactly this list of services.' },
          { label: 'Combine some',      explanation: 'Some of these are actually the same service tracked differently.' },
          { label: 'Some are missing',  explanation: 'You have other services that aren\'t in this list.' },
        ],
        data_examples: templates.map(t => `${t.display_name ?? t.service_code} (code: ${t.service_code})`),
      })
    }
  }

  // ── Q-PAT-1: Three-meaning audience structure ────────────────────────────
  // Fires when ANY source's PatternReport has audience-suffixed columns/rows.
  // The same data shape (Adult/Kid/Student counts) can mean three completely
  // different structural things — only the church knows which.
  const reportWithAudience = patternReports.find(pr =>
    pr.report?.audience_column &&
    Object.keys(pr.report.audience_column.proposed_map ?? {}).length >= 2
  )
  if (reportWithAudience?.report?.audience_column) {
    const ac = reportWithAudience.report.audience_column
    const detectedTerms = Object.keys(ac.proposed_map).filter(k => k && k.trim())
    questions.push({
      id:           'q_pattern_audience_structure',
      blocking:     true,
      type:         'choice',
      topic_group:  'pattern_verification',
      title:        'How does your church run these?',
      context:      `Your data shows breakouts by ${detectedTerms.join(', ')}. The same data shape can mean three different things, and only you can tell us which fits your church.`,
      question:     `Which best describes how these run on a typical Sunday?`,
      options: [
        {
          label:        'Parallel experiences at the same time',
          explanation:  `Each Sunday service slot has separate ${detectedTerms.length === 3 ? 'adult, kids, and student' : 'audience'} experiences happening simultaneously in different rooms — each with its own counts, leaders, and program.`,
          meaning_code: 'M3',
        },
        {
          label:        'One combined service, just counted by group',
          explanation:  `Everyone gathers together for one service. The breakouts are just headcounts of who attended, not separate experiences.`,
          meaning_code: 'M1',
        },
        {
          label:        'Separate services on different days/times',
          explanation:  `The ${detectedTerms.join(', ')} services run at completely separate times — they're independent gatherings, not parallel.`,
          meaning_code: 'M2',
        },
      ],
      data_examples: detectedTerms.slice(0, 3).map(term => `Detected term: "${term}"`),
    })
  }

  return questions
}
