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

test('dashboard exposes review and approved plan execution controls', () => {
  assert.match(html, /dataset\.agentAction='approve'/);
  assert.match(html, /dataset\.agentAction='cancel'/);
  assert.match(html, /Approved\. Ready to queue model-only execution; this worker does not run external tools\./);
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
 assert.ok(html.includes("'/steps/'+encodeURIComponent(stepButton.dataset.stepIndex)+'/status'"));
});

test('dashboard offers owner-scoped knowledge search template',()=>{
 assert.match(html,/YOUR_BOT_ID/);
 assert.match(html,/Search your knowledge base/);
});

test('dashboard exposes queued task monitoring, cancellation, and execution output panel',()=>{
 assert.match(html,/id="agent-task-list"/);
 assert.match(html,/id="agent-task-refresh"/);
 assert.match(html,/data-agent-task-cancel/);
 assert.match(html,/dataset\.agentAction='execute'/);
 assert.match(html,/Execution outputs/);
 assert.match(html,/setInterval\(\(\)=>\{loadAgentTasks\(\);loadAgentPlans\(\);(?:loadFortisniEvents\(\);)?\},10000\)/);
});


test('dashboard exposes automation workflow creation, scheduling and execution controls',()=>{
 assert.match(html,/id="automation-form"/);
 assert.match(html,/id="automation-trigger"/);
 assert.match(html,/loadAutomationWorkflows\(\)/);
 assert.match(html,/Run now/);
});

test('dashboard exposes Fortisni activity and explicit personal-memory opt-in',()=>{
 assert.match(html,/id="fortisni-agent-events"/);
 assert.match(html,/id="agent-personal-memory"/);
 assert.match(html,/includePersonalMemory/);
});
