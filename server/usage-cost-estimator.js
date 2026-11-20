/**
 * Conservative, server-side token cost estimation helpers.
 * No live prices are included; model prices must be explicitly configured.
 */
function normalizePricing(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const input = Number(entry.inputPerMillion);
  const output = Number(entry.outputPerMillion);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return { inputPerMillion: input, outputPerMillion: output, currency: String(entry.currency || 'USD').toUpperCase(), version: String(entry.version || 'unversioned') };
}
function estimateCost({ inputTokens, outputTokens, pricing }) {
  const p = normalizePricing(pricing);
  if (!p) return { known: false, cost: null, currency: null, reason: 'Pricing is missing or invalid.' };
  const input = Number(inputTokens), output = Number(outputTokens);
  if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0) return { known: false, cost: null, currency: p.currency, reason: 'Token counts must be non-negative integers.' };
  const cost = (input * p.inputPerMillion + output * p.outputPerMillion) / 1_000_000;
  return { known: true, cost, currency: p.currency, pricingVersion: p.version };
}
function reserveEstimate({ maxInputTokens, maxOutputTokens, pricing }) {
  return estimateCost({ inputTokens: maxInputTokens, outputTokens: maxOutputTokens, pricing });
}
module.exports = { normalizePricing, estimateCost, reserveEstimate };
