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
  assert.match(html, /document\.createTextNode\(step\.description\s*\+\s*['"]\s*['"]\)/);
  assert.match(html, /textContent=run\.plan\?\.title/);
});

test('dashboard exposes owner review lifecycle controls without claiming execution', () => {
  assert.match(html, /dataset\.agentAction='approve'/);
  assert.match(html, /dataset\.agentAction='cancel'/);
  assert.match(html, /Approved\. Only explicitly approved local tools can run\./);
  assert.match(html, /execute\.dataset\.agentAction='run-tool'/);
});

test('Agent Lab dashboard displays a tool catalog without enabling execution',()=>{
  assert.match(html,/id="agent-tool-catalog"/);
  assert.match(html,/id="agent-tool-catalog-list"/);
  assert.match(html,/api\('\/agents\/tools'\)/);
  assert.match(html,/Catalog preview only\. Tools cannot run yet\./);
  assert.match(html,/executionAvailable\?'Available':'Planned'/);
});

test('dashboard fetches the Agent Lab catalog and keeps catalog actions non-executable',()=>{
  assert.ok(html.includes("api('/agents/tools')"));
  assert.ok(html.includes('loadAgentToolCatalog();'));
  assert.ok(html.includes("state.textContent=tool.executionAvailable?'Available':'Planned'"));
  assert.ok(html.includes("message||'Catalog preview only. Tools cannot run yet.'"));
});

test('dashboard exposes per-run tool permission selection and execution UI',()=>{
 assert.match(html,/data-agent-tool-approval/);
 assert.match(html,/data-agent-run-tool/);
 assert.match(html,/data-agent-tool-arguments/);
 assert.match(html,/data-agent-tool-result/);
 assert.match(html,/writePermission:selected\.includes\('draft\.create'\)/);
 assert.match(html,/valid JSON/);
});

test('dashboard renders persisted Agent Lab execution history safely',()=>{
 assert.match(html,/run\.toolExecutionHistory/);
 assert.match(html,/Execution history/);
 assert.match(html,/entry\.summary/);
 assert.match(html,/line\.textContent=entry\.toolId/);
});

test('dashboard renders step status, completion progress and approved controls',()=>{
 assert.match(html,/run\.progress/);
 assert.match(html,/dataset\.agentStepAction/);
 assert.match(html,/dataset\.stepIndex=String\(index\)/);
 assert.match(html,/steps\/\+encodeURIComponent\(stepButton\.dataset\.stepIndex\)\/status/);
});
