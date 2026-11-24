'use strict';

function configureProxyTrust(app, rawValue = '0') {
  if (!app || typeof app.set !== 'function') throw new TypeError('An Express-compatible app is required.');
  const value = rawValue === undefined || rawValue === null || rawValue === '' ? '0' : String(rawValue).trim();
  if (value === '0') {
    app.set('trust proxy', false);
    return false;
  }
  if (value === '1') {
    // Trust exactly the immediately connected reverse proxy. Do not use true,
    // which trusts arbitrary forwarding chains supplied by upstream clients.
    app.set('trust proxy', 1);
    return 1;
  }
  throw new Error('TRUST_PROXY must be exactly 0 or 1. Only a single trusted reverse proxy hop is supported.');
}

module.exports = { configureProxyTrust };
