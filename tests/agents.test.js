'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlan, appendToolExecution, summarizeToolResult, MAX_GOAL_CHARS, MAX_STEPS } = require('../server/agents');
const { getToolCatalog, validateToolRequest } = require('../server/agent-tool-registry');

test('parses a valid bounded Agent Lab plan', () => {
  const plan = parsePlan(JSON.stringify({
    title: 'Launch a research report',
    summary: 'A staged plan with review before delivery.',
    steps: [
      { type: 'research', title: 'Gather sources', description: 'Identify authoritative public sources.' },
      { type: 'analyze', title: 'Compare evidence', description: 'Check claims and note uncertainties.' },
      { type: 'draft', title: 'Write report', description: 'Prepare a structured draft.' },
      { type: 'review', title: 'Verify report', description: 'Check factual support and completeness.' },
    ],
  }));
  assert.equal(plan.steps.length, 4);
  assert.equal(plan.steps[0].order, 1);
  assert.equal(plan.steps[3].type, 'review');
});

test('accepts fenced JSON but not non-JSON model prose', () => {
  const value = { title: 'Plan', summary: 'Summary', steps: [{ type: 'decide', title: 'Choose', description: 'Compare the options.' }] };
  assert.equal(parsePlan('```json\n' + JSON.stringify(value) + '\n```').title, 'Plan');
  assert.throws(() => parsePlan('Here is your plan: ' + JSON.stringify(value)), /invalid structured output/);
});

test('rejects unsupported step types and malformed steps', () => {
  assert.throws(() => parsePlan(JSON.stringify({ title: 'Plan', summary: 'Summary', steps: [{ type: 'execute-shell', title: 'Run', description: 'Run a command.' }] })), /invalid step/);
  assert.throws(() => parsePlan(JSON.stringify({ title: 'Plan', summary: 'Summary', steps: [{ type: 'research', title: 'Only title' }] })), /invalid step/);
});

test('rejects empty, oversized and excessive plans', () => {
  assert.throws(() => parsePlan(''), /invalid structured output/);
  assert.throws(() => parsePlan('x'.repeat(30001)), /invalid response/);
  const steps = Array.from({ length: MAX_STEPS + 1 }, (_, i) => ({ type: 'research', title: 'Step ' + i, description: 'Research this.' }));
  assert.throws(() => parsePlan(JSON.stringify({ title: 'Plan', summary: 'Summary', steps })), /outside the supported format/);
});

test('exports bounded goal and step limits', () => {
  assert.equal(MAX_GOAL_CHARS, 4000);
  assert.equal(MAX_STEPS, 12);
});

test('Agent Lab catalog route and safe execution routes are registered',()=>{
 const {router}=require('../server/agents');
 const route=router.stack.find(layer=>layer.route?.path==='/tools'&&layer.route.methods.get);
 assert.ok(route);
 assert.ok(router.stack.some(layer=>layer.route?.path==='/:runId/tools/:toolId'&&layer.route.methods.post));
 assert.ok(router.stack.some(layer=>layer.route?.path==='/:runId/approve'&&layer.route.methods.post));
 const catalog=getToolCatalog();
 assert.equal(catalog.length,5);
 assert.equal(catalog.find(tool=>tool.id==='text.analyze').executionAvailable,true);
 assert.equal(catalog.find(tool=>tool.id==='draft.create').executionAvailable,true);
 assert.equal(catalog.find(tool=>tool.id==='knowledge.search').executionAvailable,false);
 const policy=validateToolRequest({toolId:'knowledge.search',arguments:{query:'x'}},{runStatus:'approved',approvedToolIds:['knowledge.search']});
 assert.equal(policy.valid,false);
 assert.equal(policy.executable,false);
});

test('Agent Lab execution history is bounded, timestamped and stores summaries only',()=>{
 const run={id:'run-1',toolExecutionHistory:[]};
 const result={type:'text-analysis',characters:30,words:6,lines:2,sentences:2,preview:'private input text'};
 const next=appendToolExecution(run,'text.analyze',result,'2026-11-21T10:00:00.000Z');
 assert.equal(next.toolExecutionHistory.length,1);
 assert.equal(next.toolExecutionHistory[0].executedAt,'2026-11-21T10:00:00.000Z');
 assert.deepEqual(next.toolExecutionHistory[0].summary,{characters:30,words:6,lines:2,sentences:2});
 assert.equal(JSON.stringify(next.toolExecutionHistory).includes('private input text'),false);
 const many={toolExecutionHistory:Array.from({length:50},(_,i)=>({id:String(i)}))};
 const bounded=appendToolExecution(many,'text.analyze',result);
 assert.equal(bounded.toolExecutionHistory.length,50);
 assert.equal(bounded.toolExecutionHistory[0].id,'1');
});
test('Agent Lab history summaries avoid storing draft content',()=>{
 const summary=summarizeToolResult('draft.create',{title:'Example',status:'preview-only',content:'Sensitive body'});
 assert.deepEqual(summary,{title:'Example',status:'preview-only',characters:13});
 assert.equal(JSON.stringify(summary).includes('Sensitive body'),false);
});
