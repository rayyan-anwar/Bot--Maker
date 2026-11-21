'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlan, initializePlanSteps, transitionPlanStep, cancelPlanSteps, getPlanProgress, STEP_RETRY_LIMIT, MAX_GOAL_CHARS, MAX_STEPS } = require('../server/agents');
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
 assert.equal(catalog.find(tool=>tool.id==='knowledge.search').executionAvailable,false);
 const policy=validateToolRequest({toolId:'knowledge.search',arguments:{query:'x'}},{runStatus:'approved',approvedToolIds:['knowledge.search']});
 assert.equal(policy.valid,false);
 assert.equal(policy.executable,false);
});

test('Agent Lab steps initialize in pending state with progress',()=>{
 const steps=initializePlanSteps([{order:1,title:'Research',type:'research',description:'Find sources'},{order:2,title:'Draft',type:'draft',description:'Write draft'}]);
 assert.deepEqual(steps.map(s=>s.status),['pending','pending']);
 assert.deepEqual(getPlanProgress(steps),{total:2,completed:0,failed:0,running:0,pending:2,percent:0});
});
test('Agent Lab step state transitions track completion and timestamps',()=>{
 const base=initializePlanSteps([{title:'Analyze'}]);
 const running=transitionPlanStep(base,0,'running','2026-11-21T10:00:00.000Z');
 assert.equal(running[0].status,'running');
 assert.equal(running[0].startedAt,'2026-11-21T10:00:00.000Z');
 const completed=transitionPlanStep(running,0,'completed','2026-11-21T10:02:00.000Z');
 assert.equal(completed[0].status,'completed');
 assert.equal(completed[0].completedAt,'2026-11-21T10:02:00.000Z');
 assert.deepEqual(getPlanProgress(completed),{total:1,completed:1,failed:0,running:0,pending:0,percent:100});
 assert.throws(()=>transitionPlanStep(completed,0,'running'),/Invalid step state transition/);
});
test('Agent Lab failed steps can retry only within bounded retry policy',()=>{
 let steps=initializePlanSteps([{title:'Retry me'}]);
 steps=transitionPlanStep(steps,0,'running');
 steps=transitionPlanStep(steps,0,'failed');
 assert.equal(steps[0].status,'failed');
 for(let i=0;i<STEP_RETRY_LIMIT;i++){
   steps=transitionPlanStep(steps,0,'pending');
   assert.equal(steps[0].retryCount,i+1);
   steps=transitionPlanStep(steps,0,'running');
   steps=transitionPlanStep(steps,0,'failed');
 }
 assert.throws(()=>transitionPlanStep(steps,0,'pending'),/Invalid step state transition/);
});
test('Agent Lab rejects invalid step IDs, statuses and transitions',()=>{
 const steps=initializePlanSteps([{title:'A'}]);
 assert.throws(()=>transitionPlanStep(steps,-1,'running'),/Invalid step index/);
 assert.throws(()=>transitionPlanStep(steps,0,'unknown'),/Unsupported step status/);
 assert.throws(()=>transitionPlanStep(steps,0,'completed'),/Invalid step state transition/);
});

test('Agent Lab run cancellation marks pending and running steps cancelled',()=>{
 const initial=initializePlanSteps([{title:'One'},{title:'Two'}]);
 const running=transitionPlanStep(initial,0,'running');
 const cancelled=cancelPlanSteps(running,'2026-11-21T12:00:00.000Z');
 assert.deepEqual(cancelled.map(s=>s.status),['cancelled','cancelled']);
 assert.ok(cancelled.every(s=>s.completedAt==='2026-11-21T12:00:00.000Z'));
 assert.deepEqual(getPlanProgress(cancelled),{total:2,completed:0,failed:0,running:0,pending:0,percent:0});
});
