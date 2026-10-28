import type { TokenUsage } from '@tanstack/ai'
import { MODEL_TOKEN_RATES, type ModelTokenRates } from '@/lib/ai-model-pricing'

function ratesForModel(model: string): ModelTokenRates | undefined {
  // Responses can report a dated snapshot such as `gpt-5.1-2025-11-13`.
  return (
    MODEL_TOKEN_RATES[model] ??
    MODEL_TOKEN_RATES[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')]
  )
}

export function estimateTokenCostUsd(
  model: string,
  usage: TokenUsage,
): number | null {
  if (usage.cost !== undefined && Number.isFinite(usage.cost)) {
    return Math.max(0, usage.cost)
  }

  const rates = ratesForModel(model)
  if (!rates) return null

  const selected =
    rates.longContext && usage.promptTokens > rates.longContext.thresholdTokens
      ? rates.longContext
      : rates
  const cachedTokens = Math.min(
    usage.promptTokens,
    usage.promptTokensDetails?.cachedTokens ?? 0,
  )
  const regularInputTokens = usage.promptTokens - cachedTokens

  return (
    (regularInputTokens * selected.input +
      cachedTokens * selected.cachedInput +
      usage.completionTokens * selected.output) /
    1_000_000
  )
}
