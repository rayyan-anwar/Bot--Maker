'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Prometheus alert rules reference metrics exported by BotForge', () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'prometheus-alerts.yml'), 'utf8');
  const metrics = fs.readFileSync(path.join(__dirname, '..', 'server', 'metrics.js'), 'utf8');
  for (const metric of [
    'botforge_http_server_errors_total',
    'botforge_http_requests_total',
    'botforge_http_request_duration_ms_sum',
    'botforge_process_resident_memory_bytes'
  ]) {
    assert.ok(metrics.includes(metric), 'metrics exporter must expose ' + metric);
    assert.ok(rules.includes(metric), 'alert rules must reference ' + metric);
  }
  assert.equal((rules.match(/^      - alert:/gm) || []).length, 3);
  assert.equal((rules.match(/^        for: /gm) || []).length, 3);
  assert.match(rules, /severity: critical/);
  assert.match(rules, /severity: warning/);
});
