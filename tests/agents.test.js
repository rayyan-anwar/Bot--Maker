'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlan, initializePlanSteps, transitionPlanStep, cancelPlanSteps, getPlanProgress, STEP_RETRY_LIMIT, appendToolExecution, summarizeToolResult, MAX_GOAL_CHARS, MAX_STEPS } = require('../server/agents');
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
 assert.ok(router.stack.some(layer=>layer.route?.path==='/:runId/steps/:stepIndex/status'&&layer.route.methods.post));
 const catalog=getToolCatalog();
 assert.equal(catalog.length,5);
 assert.equal(catalog.find(tool=>tool.id==='text.analyze').executionAvailable,true);
 assert.equal(catalog.find(tool=>tool.id==='draft.create').executionAvailable,true);
 assert.equal(catalog.find(tool=>tool.id==='knowledge.search').executionAvailable,true);
 const policy=validateToolRequest({toolId:'knowledge.search',arguments:{botId:'bot-id',query:'x'}},{runStatus:'approved',approvedToolIds:['knowledge.search']});
 assert.equal(policy.valid,true);
 assert.equal(policy.executable,true);
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
 assert.deepEqual(summary,{title:'Example',status:'preview-only',characters:14});
 assert.equal(JSON.stringify(summary).includes('Sensitive body'),false);
});

test('plan steps initialize pending with bounded progress',()=>{
 const steps=initializePlanSteps([{title:'A'},{title:'B'}]);
 assert.deepEqual(steps.map(s=>s.status),['pending','pending']);
 assert.deepEqual(getPlanProgress(steps),{total:2,completed:0,failed:0,running:0,pending:2,percent:0});
});
test('step lifecycle rejects invalid transitions and timestamps completion',()=>{
 let steps=initializePlanSteps([{title:'A'}]);
 steps=transitionPlanStep(steps,0,'running','2026-11-21T10:00:00.000Z');
 steps=transitionPlanStep(steps,0,'completed','2026-11-21T10:02:00.000Z');
 assert.equal(steps[0].completedAt,'2026-11-21T10:02:00.000Z');
 assert.equal(getPlanProgress(steps).percent,100);
 assert.throws(()=>transitionPlanStep(steps,0,'running'),/Invalid step state transition/);
});
test('failed step retries are bounded',()=>{
 let steps=initializePlanSteps([{title:'Retry'}]);
 for(let i=0;i<STEP_RETRY_LIMIT;i++){
  steps=transitionPlanStep(steps,0,'running');
  steps=transitionPlanStep(steps,0,'failed');
  steps=transitionPlanStep(steps,0,'pending');
  assert.equal(steps[0].retryCount,i+1);
 }
 steps=transitionPlanStep(steps,0,'running');
 steps=transitionPlanStep(steps,0,'failed');
 assert.throws(()=>transitionPlanStep(steps,0,'pending'),/Invalid step state transition/);
});
test('cancellation marks unfinished steps cancelled',()=>{
 const initial=initializePlanSteps([{title:'One'},{title:'Two'}]);
 const running=transitionPlanStep(initial,0,'running');
 const cancelled=cancelPlanSteps(running,'2026-11-21T12:00:00.000Z');
 assert.deepEqual(cancelled.map(s=>s.status),['cancelled','cancelled']);
});

test('Agent Lab exposes owner-scoped knowledge search route',()=>{
 const {router}=require('../server/agents');
 assert.ok(router.stack.some(layer=>layer.route?.path==='/:runId/tools/:toolId'&&layer.route.methods.post));
});

test('Agent Lab task API and approved-plan execution routes are registered',()=>{
 const {router}=require('../server/agents');
 assert.ok(router.stack.some(layer=>layer.route?.path==='/tasks'&&layer.route.methods.post));
 assert.ok(router.stack.some(layer=>layer.route?.path==='/tasks'&&layer.route.methods.get));
 assert.ok(router.stack.some(layer=>layer.route?.path==='/tasks/:taskId'&&layer.route.methods.get));
 assert.ok(router.stack.some(layer=>layer.route?.path==='/tasks/:taskId/cancel'&&layer.route.methods.post));
 assert.ok(router.stack.some(layer=>layer.route?.path==='/:runId/execute'&&layer.route.methods.post));
});
