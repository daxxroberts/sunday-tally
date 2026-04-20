// Anthropic token pricing — USD per million tokens.
// Verify against https://www.anthropic.com/pricing when rates change;
// a single edit here propagates to budget math everywhere.

export type AiModel =
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'

interface ModelRates {
  inputPerMTok:       number
  outputPerMTok:      number
  cacheReadPerMTok:   number  // 0.1x input
  cacheCreatePerMTok: number  // 1.25x input (ephemeral / 5m TTL)
}

const RATES: Record<AiModel, ModelRates> = {
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
