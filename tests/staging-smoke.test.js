const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEndpoints } = require('../scripts/staging-smoke');

function healthyResponse(status = 200, body = { ok: true, service: 'botforge-api', database: { provider: 'postgres' } }, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
      ...headers
    }
  });
}

test('staging smoke checks health, PostgreSQL readiness and security headers', async () => {
  const calls = [];
  const result = await checkEndpoints('https://staging.example.test', async (url, options) => {
    calls.push({ path: new URL(url).pathname, redirect: options.redirect });
    return healthyResponse();
  });
  assert.deepEqual(calls, [
    { path: '/healthz', redirect: 'manual' },
    { path: '/readyz', redirect: 'manual' }
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.results[1].database, 'postgres');
  assert.deepEqual(result.results[1].missingSecurityHeaders, []);
});

test('staging smoke fails when readiness is unavailable', async () => {
  let count = 0;
  const result = await checkEndpoints('https://staging.example.test', async () => {
    count++;
    return healthyResponse(count === 1 ? 200 : 503, {});
  });
  assert.equal(result.ok, false);
  assert.equal(result.results[1].status, 503);
});

test('staging smoke fails when readiness is not backed by healthy PostgreSQL', async () => {
  const result = await checkEndpoints('https://staging.example.test', async () =>
    healthyResponse(200, { ok: true, service: 'botforge-api', database: { provider: 'json' } })
  );
  assert.equal(result.results[1].ok, false);
  assert.match(result.results[1].error, /PostgreSQL/);
});

test('staging smoke fails when required proxy security headers are absent', async () => {
  const result = await checkEndpoints('https://staging.example.test', async () =>
    healthyResponse(200, {}, { 'strict-transport-security': null, 'x-content-type-options': null })
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.results[0].missingSecurityHeaders, ['strict-transport-security', 'x-content-type-options']);
});

test('staging smoke rejects insecure remote URLs and URL credentials', async () => {
  await assert.rejects(() => checkEndpoints('http://staging.example.test'), /HTTPS/);
  await assert.rejects(() => checkEndpoints('https://user:pass@staging.example.test'), /credentials/);
});
