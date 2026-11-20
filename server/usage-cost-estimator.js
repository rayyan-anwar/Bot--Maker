/**
 * Server-side AI token cost estimator.
 * Pricing is explicit, versioned configuration; missing prices are unknown.
 */
function normalizePricing(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const input = entry.inputPerMillion;
  const output = entry.outputPerMillion;
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 ||
      typeof output !== 'number' || !Number.isFinite(output) || output < 0) return null;
  const currency = typeof entry.currency === 'string' ? entry.currency.trim().toUpperCase() : 'USD';
  const version = typeof entry.version === 'string' ? entry.version.trim() : '';
  if (!/^[A-Z]{3}$/.test(currency) || !version || version.length > 100) return null;
  return { inputPerMillion: input, outputPerMillion: output, currency, version };
}

function estimateCost({ inputTokens, outputTokens, pricing } = {}) {
  const normalized = normalizePricing(pricing);
  if (!normalized) return { known: false, cost: null, currency: null, reason: 'Pricing is missing or invalid.' };
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
      !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
    return { known: false, cost: null, currency: normalized.currency, reason: 'Token counts must be non-negative safe integers.' };
  }
  const cost = (inputTokens * normalized.inputPerMillion + outputTokens * normalized.outputPerMillion) / 1_000_000;
  if (!Number.isFinite(cost)) {
    return { known: false, cost: null, currency: normalized.currency, reason: 'Estimated cost exceeds the supported numeric range.' };
  }
  return { known: true, cost, currency: normalized.currency, pricingVersion: normalized.version };
}

function reserveEstimate({ maxInputTokens, maxOutputTokens, pricing } = {}) {
  return estimateCost({ inputTokens: maxInputTokens, outputTokens: maxOutputTokens, pricing });
}

module.exports = { normalizePricing, estimateCost, reserveEstimate };
