'use strict';

const REQUIRED_SECURITY_HEADERS = {
  'strict-transport-security': value => /^max-age=\d+/i.test(value || ''),
  'x-content-type-options': value => String(value || '').toLowerCase() === 'nosniff',
  'content-security-policy': value => /frame-ancestors\s+'none'/i.test(value || '')
};

async function checkEndpoints(baseUrl, fetchImpl = fetch) {
  let url;
  try { url = new URL(baseUrl); } catch (_) { throw new TypeError('A valid staging base URL is required.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError('Use a clean HTTP(S) base URL without credentials, query or fragment.');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new TypeError('Non-local staging endpoints must use HTTPS.');
  }

  const results = [];
  for (const endpoint of ['/healthz', '/readyz']) {
    let response;
    try {
      response = await fetchImpl(new URL(endpoint, url), {
        headers: { accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
      });
    } catch (_) {
      results.push({ endpoint, ok: false, status: 0, error: 'Request failed or timed out.' });
      continue;
    }

    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    const headers = Object.fromEntries(Object.keys(REQUIRED_SECURITY_HEADERS).map(name => [name, response.headers.get(name)]));
    const missingHeaders = Object.entries(REQUIRED_SECURITY_HEADERS)
      .filter(([name, valid]) => !valid(headers[name]))
      .map(([name]) => name);
    const database = typeof payload.database?.provider === 'string' ? payload.database.provider : null;
    const readinessOk = endpoint !== '/readyz' || (payload.ok === true && database === 'postgres');

    results.push({
      endpoint,
      ok: response.ok && missingHeaders.length === 0 && readinessOk,
      status: response.status,
      service: typeof payload.service === 'string' ? payload.service : null,
      database,
      securityHeaders: headers,
      missingSecurityHeaders: missingHeaders,
      error: !response.ok
        ? 'Health check returned a non-success status.'
        : missingHeaders.length
          ? 'Required security headers are missing or invalid.'
          : !readinessOk
            ? 'Readiness must confirm a healthy PostgreSQL database.'
            : null
    });
  }

  return { ok: results.every(item => item.ok), checkedAt: new Date().toISOString(), results };
}

if (require.main === module) {
  const base = process.argv[2] || process.env.BOTFORGE_STAGING_URL;
  if (!base) {
    console.error('Usage: node scripts/staging-smoke.js https://staging.example.com');
    process.exit(2);
  }
  checkEndpoints(base).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

module.exports = { checkEndpoints };
