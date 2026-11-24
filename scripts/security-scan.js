'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', '.next', 'vendor']);
const RULES = [
  { id: 'private-key', severity: 'critical', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, message: 'Private key material appears in source.' },
  { id: 'github-token', severity: 'critical', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, message: 'A GitHub token-like value appears in source.' },
  { id: 'aws-access-key', severity: 'critical', pattern: /\bAKIA[0-9A-Z]{16}\b/g, message: 'An AWS access-key identifier appears in source.' },
  { id: 'dynamic-code', severity: 'high', pattern: /\beval\s*\(|\bnew\s+Function\s*\(/g, message: 'Dynamic code execution primitive found; review whether input can be influenced externally.' },
  { id: 'shell-execution', severity: 'high', pattern: /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(/g, message: 'Shell/process execution primitive found; verify arguments are never user-controlled.' },
  { id: 'disabled-tls', severity: 'critical', pattern: /rejectUnauthorized\s*:\s*false/g, message: 'TLS certificate verification is disabled.' },
  { id: 'insecure-http', severity: 'medium', pattern: /http:\/\/(?!localhost\b|127\.0\.0\.1\b)[A-Za-z0-9.-]+/g, message: 'Plain HTTP URL found; verify this is not a production endpoint.' }
];

function scanText(source, file = '<memory>') {
  const findings = [];
  const lines = String(source).split(/\r?\n/);
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(lines[i])) findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        file,
        line: i + 1,
        message: rule.message
      });
    }
  }
  return findings;
}

function scanPaths(paths) {
  const findings = [];
  let filesScanned = 0;
  function visit(file) {
    let stat;
    try { stat = fs.statSync(file); } catch { return; }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file)) {
        if (EXCLUDED_DIRS.has(name)) continue;
        visit(path.join(file, name));
      }
      return;
    }
    if (!stat.isFile() || stat.size > 1024 * 1024) return;
    if (!/\.(?:js|cjs|mjs|json|yml|yaml|html)$/.test(file)) return;
    filesScanned++;
    findings.push(...scanText(fs.readFileSync(file, 'utf8'), file));
  }
  for (const item of paths) if (fs.existsSync(item)) visit(item);
  return { filesScanned, findings };
}

if (require.main === module) {
  const paths = process.argv.slice(2);
  const result = scanPaths(paths.length ? paths : ['server', 'public/js', '.github/workflows']);
  console.log(JSON.stringify({ scanner: 'BotForge heuristic security scanner', scope: 'source-pattern review only; not a complete security audit', ...result }, null, 2));
  if (result.findings.some(item => item.severity === 'critical')) process.exitCode = 1;
}

module.exports = { scanText, scanPaths };
