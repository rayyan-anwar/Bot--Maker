const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePricing, estimateCost, reserveEstimate } = require('../server/usage-cost-estimator');

const pricing = { inputPerMillion: 2, outputPerMillion: 8, currency: 'usd', version: 'test-v1' };

test('normalizes explicit pricing and currency', () => {
  assert.deepEqual(normalizePricing(pricing), {
    inputPerMillion: 2, outputPerMillion: 8, currency: 'USD', version: 'test-v1'
  });
});

test('missing or invalid pricing remains unknown, never zero', () => {
  for (const value of [undefined, null, {}, { inputPerMillion: -1, outputPerMillion: 1 }, { inputPerMillion: 1, outputPerMillion: Infinity }]) {
    const result = estimateCost({ inputTokens: 0, outputTokens: 0, pricing: value });
    assert.equal(result.known, false);
    assert.equal(result.cost, null);
  }
});

test('estimates input and output token costs separately', () => {
  const result = estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000, pricing });
  assert.equal(result.known, true);
  assert.equal(result.cost, 6);
  assert.equal(result.currency, 'USD');
  assert.equal(result.pricingVersion, 'test-v1');
});

test('rejects negative, fractional, unsafe, and non-numeric token counts', () => {
  for (const tokens of [
    { inputTokens: -1, outputTokens: 0 },
    { inputTokens: 0, outputTokens: 1.5 },
    { inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 0 },
    { inputTokens: 'abc', outputTokens: 0 }
  ]) {
    const result = estimateCost({ ...tokens, pricing });
    assert.equal(result.known, false);
    assert.equal(result.cost, null);
  }
});

test('reservation estimate uses the configured maximum token allowance', () => {
  const result = reserveEstimate({ maxInputTokens: 100_000, maxOutputTokens: 50_000, pricing });
  assert.equal(result.known, true);
  assert.equal(result.cost, 0.6);
});

test('zero-token estimate is valid when pricing is configured', () => {
  const result = estimateCost({ inputTokens: 0, outputTokens: 0, pricing });
  assert.equal(result.known, true);
  assert.equal(result.cost, 0);
});
