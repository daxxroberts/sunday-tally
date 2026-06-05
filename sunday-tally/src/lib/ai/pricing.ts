// Anthropic token pricing — USD per million tokens.
// Verify against https://www.anthropic.com/pricing when rates change;
// a single edit here propagates to budget math everywhere.

export type AiModel =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'

interface ModelRates {
  inputPerMTok:       number
  outputPerMTok:      number
  cacheReadPerMTok:   number
  cacheCreatePerMTok: number
}

const RATES: Record<AiModel, ModelRates> = {
  // Opus is NOT on any default path (Pattern Reader defaults to Sonnet; only the
  // IMPORT_PATTERN_READER_MODEL env override reaches Opus). Rates verified against
  // platform.claude.com pricing 2026-06-05: $5 in / $25 out, cache read $0.50 /
  // 5m-write $6.25. NOTE: Opus 4.7+ uses a new tokenizer that can consume up to
  // ~35% more tokens for the same text — a further reason to stay on Sonnet.
  'claude-opus-4-7': {
    inputPerMTok:        5.00,
    outputPerMTok:      25.00,
    cacheReadPerMTok:    0.50,
    cacheCreatePerMTok:  6.25,
  },
  'claude-sonnet-4-6': {
    inputPerMTok:       3.00,
    outputPerMTok:     15.00,
    cacheReadPerMTok:   0.30,
    cacheCreatePerMTok: 3.75,
  },
  'claude-haiku-4-5-20251001': {
    inputPerMTok:       1.00,
    outputPerMTok:      5.00,
    cacheReadPerMTok:   0.10,
    cacheCreatePerMTok: 1.25,
  },
}

export interface UsageTokens {
  input:       number
  output:      number
  cacheRead?:  number
  cacheCreate?: number
}

/** Converts token usage to whole cents (rounded up so we never under-charge). */
export function tokensToCents(model: AiModel, usage: UsageTokens): number {
  const rates = RATES[model]
  if (!rates) throw new Error(`Unknown AI model: ${model}`)

  const usd =
    (usage.input        * rates.inputPerMTok)       / 1_000_000 +
    (usage.output       * rates.outputPerMTok)      / 1_000_000 +
    ((usage.cacheRead   ?? 0) * rates.cacheReadPerMTok)   / 1_000_000 +
    ((usage.cacheCreate ?? 0) * rates.cacheCreatePerMTok) / 1_000_000

  return Math.ceil(usd * 100)
}
