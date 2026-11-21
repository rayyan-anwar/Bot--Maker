'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

test('dashboard exposes the Agent Lab planning form with bounded goal input', () => {
  assert.match(html, /id="agent-lab"/);
  assert.match(html, /id="agent-plan-form"/);
  assert.match(html, /id="agent-goal"[^>]*maxlength="4000"/);
  assert.match(html, /id="agent-plan-submit"/);
  assert.match(html, /id="agent-plan-error"/);
});

test('dashboard loads private plans and renders content using safe DOM text APIs', () => {
  assert.match(html, /api\('\/agents\/mine'\)/);
  assert.match(html, /document\.createElement\('article'\)/);
  assert.match(html, /document\.createTextNode\(step\.description\)/);
  assert.match(html, /textContent=run\.plan\?\.title/);
});

test('dashboard exposes owner review lifecycle controls without claiming execution', () => {
  assert.match(html, /dataset\.agentAction='approve'/);
  assert.match(html, /dataset\.agentAction='cancel'/);
  assert.match(html, /Approved for review only\. No tools have run\./);
  assert.match(html, /api\('\/agents\/'\+encodeURIComponent\(button\.dataset\.runId\)\+'\/'\+button\.dataset\.agentAction/);
});
