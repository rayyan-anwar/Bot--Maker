const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePricing, estimateCost, reserveEstimate } = require('../server/usage-cost-estimator');

const pricing = { inputPerMillion: 2, outputPerMillion: 8, currency: 'usd', version: 'test-v1' };

test('normalizes explicit versioned pricing', () => {
  assert.deepEqual(normalizePricing(pricing), { inputPerMillion: 2, outputPerMillion: 8, currency: 'USD', version: 'test-v1' });
});

test('missing, malformed and incomplete pricing remains unknown', () => {
  for (const value of [undefined, null, {}, { inputPerMillion: null, outputPerMillion: 1, version: 'v1' },
    { inputPerMillion: -1, outputPerMillion: 1, version: 'v1' },
    { inputPerMillion: 1, outputPerMillion: Infinity, version: 'v1' },
    { inputPerMillion: 1, outputPerMillion: 2, currency: 'US', version: 'v1' },
    { inputPerMillion: 1, outputPerMillion: 2, version: '' }]) {
    assert.equal(estimateCost({ inputTokens: 0, outputTokens: 0, pricing: value }).known, false);
  }
});

test('calculates input and output costs separately', () => {
  assert.deepEqual(estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000, pricing }),
    { known: true, cost: 6, currency: 'USD', pricingVersion: 'test-v1' });
});

test('rejects negative, fractional, string, null and unsafe token counts', () => {
  for (const value of [-1, 1.5, '100', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(estimateCost({ inputTokens: value, outputTokens: 0, pricing }).known, false);
  }
});

test('reservation estimate uses maximum token allowance', () => {
  assert.equal(reserveEstimate({ maxInputTokens: 100_000, maxOutputTokens: 50_000, pricing }).cost, 0.6);
});

test('zero-token estimate is valid with configured pricing', () => {
  assert.equal(estimateCost({ inputTokens: 0, outputTokens: 0, pricing }).cost, 0);
});
