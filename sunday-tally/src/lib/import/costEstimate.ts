import type { NormalizedSource } from './sources'

/**
 * Deterministic pre-flight estimate of Stage A AI cost (US cents) from the
 * SHAPE of an upload — used to block oversized trial imports BEFORE spending a
 * cent (no AI involved in the estimate itself).
 *
 * Rows are deliberately ignored: the pattern reader analyses every row as
 * statistics + a 20-row sample, so Stage A cost scales with TABS (one
 * pattern-reader pass each) and COLUMNS (bigger stats + a bigger mapping), not
 * row count. A church can bring full history for free.
 *
 * Calibrated on real imports (a 1-tab, ~12-column sheet ≈ 24¢ of Sonnet across
 * the pattern + decision passes). Constants err HIGH via the safety factor so
 * we under-promise on capacity rather than start an import we can't finish.
 */

const DECISION_BASE_CENTS = 12   // one decision-maker pass, baseline
const PER_TAB_CENTS       = 14   // one pattern-reader pass per data tab
const PER_COLUMN_CENTS    = 0.4  // wider sheets enlarge the stats + mapping output
const SAFETY              = 1.3  // headroom for validate / round-2 / corrections / Stage B

export interface ImportSizeEstimate {
  /** Estimated Stage A spend in US cents (safety-factored). */
  cents:   number
  /** Data tabs the AI will actually process (excludes text + failed sources). */
  tabs:    number
  /** Total columns across those tabs. */
  columns: number
}

/**
 * Estimate Stage A cost from the normalized sources. Only real data tabs count
 * — free-text descriptions and sources that failed to parse cost ~nothing and
 * are excluded.
 */
export function estimateStageACents(sources: NormalizedSource[]): ImportSizeEstimate {
  const dataSources = sources.filter(
    (s) => s.kind !== 'text' && !s.error && s.columns.length > 0,
  )
  const tabs    = dataSources.length
  const columns = dataSources.reduce((n, s) => n + s.columns.length, 0)
  const raw     = DECISION_BASE_CENTS + tabs * PER_TAB_CENTS + columns * PER_COLUMN_CENTS
  return { cents: Math.ceil(raw * SAFETY), tabs, columns }
}

/**
 * Warm, church-language explanation when an import is too large for the
 * remaining free-trial setup allowance. Tabs are the dominant cost lever, so
 * lead with "import fewer tabs"; fall back to columns for the rare single wide
 * sheet. Never mentions rows — history length is not the problem.
 */
export function tooLargeMessage(est: ImportSizeEstimate): string {
  if (est.tabs >= 2) {
    return (
      `This workbook has ${est.tabs} tabs — that's a lot to set up in one go on the free trial. ` +
      `Import one or two tabs now to get going, and you can add the rest anytime once you're set up.`
    )
  }
  return (
    `This sheet is unusually wide (${est.columns} columns) for a free-trial import. ` +
    `Bring just the columns you most want to track now — you can import the rest later once you're set up.`
  )
}
