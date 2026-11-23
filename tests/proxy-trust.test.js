'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { configureProxyTrust } = require('../server/proxy-trust');
const { createServer } = require('node:http');

async function requestIp(trustProxy, forwardedFor) {
  const app = express();
  configureProxyTrust(app, trustProxy);
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/ip', {
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}
    });
    assert.equal(response.status, 200);
    return (await response.json()).ip;
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('TRUST_PROXY=0 ignores a client-supplied X-Forwarded-For address', async () => {
  const ip = await requestIp('0', '198.51.100.77');
  assert.match(ip, /127\\.0\\.0\\.1|::1|::ffff:127\\.0\\.0\\.1/);
  assert.notEqual(ip, '198.51.100.77');
});

test('TRUST_PROXY=1 trusts exactly one directly connected proxy hop', async () => {
  const ip = await requestIp('1', '198.51.100.77');
  assert.equal(ip, '198.51.100.77');
});

test('proxy trust rejects ambiguous hop counts and blanket trust values', () => {
  const app = express();
  for (const value of ['true', '*', '2', ' 1,2 ']) {
    assert.throws(() => configureProxyTrust(app, value), /exactly 0 or 1/);
  }
});

test('main application wires the validated proxy trust policy before rate limiters', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../server/index'), 'utf8');
  assert.match(source, /configureProxyTrust\\(app,process\\.env\\.TRUST_PROXY\\)/);
  assert.ok(source.indexOf('configureProxyTrust') < source.indexOf('const apiLimiter'));
});
