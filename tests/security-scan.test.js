'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scanText } = require('../scripts/security-scan');

test('detects private key material without returning source contents', () => {
  const findings = scanText('-----BEGIN PRIVATE KEY-----', 'fixture.js');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'private-key');
  assert.equal(findings[0].severity, 'critical');
  assert.equal(findings[0].file, 'fixture.js');
  assert.equal(findings[0].line, 1);
  assert.equal(Object.hasOwn(findings[0], 'matchedText'), false);
});

test('detects dangerous dynamic code and disabled TLS', () => {
  const findings = scanText('eval(userInput);\nconst client = { rejectUnauthorized: false };');
  assert.deepEqual(findings.map(item => item.ruleId).sort(), ['disabled-tls', 'dynamic-code']);
});

test('ignores safe localhost HTTP development URLs', () => {
  assert.deepEqual(scanText('const local = "http://localhost:3000";'), []);
});

test('reports plain HTTP external endpoints as review findings', () => {
  const findings = scanText('const endpoint = "http://api.example.com";');
  assert.equal(findings[0].ruleId, 'insecure-http');
  assert.equal(findings[0].severity, 'medium');
});

test('does not flag secure HTTPS provider endpoints', () => {
  assert.deepEqual(scanText('const endpoint = "https://api.example.com";'), []);
});

test('detects GitHub and AWS credential identifiers as critical findings', () => {
  const findings = scanText('const gh = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";\nconst aws = "AKIA1234567890ABCDEF";');
  assert.deepEqual(findings.map(item => item.ruleId).sort(), ['aws-access-key', 'github-token']);
  assert.ok(findings.every(item => item.severity === 'critical'));
  assert.ok(findings.every(item => !Object.hasOwn(item, 'matchedText')));
});

test('reports shell execution primitives for manual review', () => {
  const findings = scanText('exec(command);\nspawnSync("echo", args, { shell: true });');
  assert.ok(findings.some(item => item.ruleId === 'shell-execution'));
});

test('reports correct line numbers for findings across multiline input', () => {
  const findings = scanText('safe();\n\nconst tls = { rejectUnauthorized: false };');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test('detects all supported process execution APIs', () => {
  for (const api of ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync']) {
    const findings = scanText(api + '(command);', 'process-fixture.js');
    assert.ok(findings.some(item => item.ruleId === 'shell-execution'), api + ' should be detected');
  }
});
