import type { TallFormatConfig } from '@/lib/import/stageB'
import type { ProposedSetup } from '@/lib/import/stageA_validate'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuestionOption {
  label:         string
  explanation:   string
  meaning_code?: string
}
// Stage A mapping-JSON question shape (richer UI fields: explanation, why,
// recommended_answer, topic_group). Deliberately distinct from the validator's
// ClarificationProposal in stageA_validate — do not merge them.
export interface ClarificationQuestion {
  id?:                 string
  blocking?:           boolean
  type?:               'text' | 'choice' | 'policy_collapse'
  title?:              string
  context?:            string
  question:            string
  why?:                string
  recommended_answer?: string
  options?:            QuestionOption[]
  data_examples?:      string[]
  collapse_target_ids?: string[]
  topic_group?:        'pattern_verification' | string
}
export interface ProposedColumnMap {
  source_column: string
  dest_field:    string
  notes?:        string
}
export interface ProposedSource {
  source_name:  string
  dest_table?:  string
  date_column?: string
  date_format?: string
  column_map:   ProposedColumnMap[]
  notes?:       string
  tall_format?: TallFormatConfig
}
export interface MonthlyRow {
  month: string
  main:  number
  kids:  number
  youth: number
}
export interface PreviewData {
  monthly_attendance: MonthlyRow[]
  date_range:         { start: string; end: string }
  note?:              string
}
export interface QuickSummary {
  avg_volunteers_per_sunday?: number | null
  total_response_count?:      number | null
  total_giving_amount?:       number | null
  low_confidence?:            boolean
  note?:                      string | null
}
export interface ProposedMapping {
  sources:                  ProposedSource[]
  proposed_setup?:          ProposedSetup
  anomalies?:               Array<{ kind: string; description: string }>
  clarification_questions?: ClarificationQuestion[]
  dashboard_warnings?:      string[]
  preview_data?:            PreviewData | null
  quick_summary?:           QuickSummary | null
  confidence?:              'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE'
  weeks_observed?:          number
  low_confidence_note?:     string
}

export interface QaState {
  questionId?:     string
  question:        string
  answer:          string
  accepted:        boolean
  selectedOption?: number
  meaningCode?:    string
}
