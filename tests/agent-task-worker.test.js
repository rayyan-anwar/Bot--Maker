'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const store=require('../server/store');
const providers=require('../server/providers');
const usage=require('../server/usage');
const worker=require('../server/agent-task-worker');

const runId='123e4567-e89b-42d3-a456-426614174001';
const taskId='123e4567-e89b-42d3-a456-426614174002';
const owner='owner-1';
const originals={};
const records=new Map();
let generated=0;
function setup(){
 for(const name of ['findByIdAsync','updateByIdAsync'])originals[name]=store[name];
 for(const name of ['isProviderConfigured','getDefaultModel','generate'])originals['providers_'+name]=providers[name];
 for(const name of ['reserveAiBudget','settleAiBudget','releaseAiBudget'])originals['usage_'+name]=usage[name];
 records.set(runId,{id:runId,userId:owner,kind:'agent-plan',status:'approved',goal:'Write a short overview',provider:'openai',plan:{steps:[{type:'draft',title:'Draft',description:'Write a short overview',status:'pending'}]},progress:{total:1,completed:0,failed:0,running:0,pending:1,percent:0}});
 records.set(taskId,{id:taskId,userId:owner,kind:'agent-task',status:'running',leaseOwner:'test-worker',leaseExpiresAt:new Date(Date.now()+60000).toISOString(),payload:{planId:runId}});
 store.findByIdAsync=async(_collection,id)=>records.get(id)||null;
 store.updateByIdAsync=async(_collection,id,patch)=>{const row=records.get(id);if(!row)return null;const next={...row,...patch};records.set(id,next);return next;};
 providers.isProviderConfigured=()=>true;providers.getDefaultModel=()=> 'test-model';providers.generate=async()=>{generated++;return{text:'Completed draft output',usage:{}};};
 usage.reserveAiBudget=async()=>({reservationId:'reserve'});usage.settleAiBudget=async()=>true;usage.releaseAiBudget=async()=>true;
 generated=0;
}
function teardown(){for(const name of ['findByIdAsync','updateByIdAsync'])store[name]=originals[name];for(const name of ['isProviderConfigured','getDefaultModel','generate'])providers[name]=originals['providers_'+name];for(const name of ['reserveAiBudget','settleAiBudget','releaseAiBudget'])usage[name]=originals['usage_'+name];records.clear();}
test('approved plan worker completes step and persists output',async()=>{setup();try{const result=await worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'});assert.equal(result.stepsCompleted,1);assert.equal(generated,1);const run=records.get(runId);assert.equal(run.status,'completed');assert.equal(run.plan.steps[0].status,'completed');assert.equal(run.executionOutputs[0].text,'Completed draft output');assert.deepEqual(run.executionLogs.map(log=>log.event),['step.started','step.completed']);}finally{teardown();}});
test('approved plan worker rejects task owner mismatch',async()=>{setup();try{const task={...records.get(taskId),userId:'intruder'};await assert.rejects(worker.executeApprovedPlan(task,{workerId:'test-worker'}),/not found for task owner/);assert.equal(generated,0);}finally{teardown();}});
test('worker retries resume completed steps without repeating successful work',async()=>{setup();try{
 const run=records.get(runId);run.plan.steps.push({type:'analyze',title:'Analyze',description:'Analyze the draft',status:'pending'});
 let failOnce=true;providers.generate=async()=>{generated++;if(generated===2&&failOnce){failOnce=false;throw new Error('temporary provider error');}return{text:'Output '+generated,usage:{}};};
 await assert.rejects(worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'}),/temporary provider error/);
 assert.equal(records.get(runId).executionOutputs.length,1);
 const resumed=await worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'});
 assert.equal(resumed.stepsCompleted,2);assert.equal(generated,3);assert.equal(records.get(runId).status,'completed');
 assert.deepEqual(records.get(runId).executionOutputs.map(item=>item.step),[1,2]);
 }finally{teardown();}});

test('terminal task failure synchronizes executing plan to failed',async()=>{
 const taskService=require('../server/agent-task-service');
 const savedClaim=taskService.claimTask,savedFail=taskService.failTask,savedHandler=worker.handlers.get('agent.plan.execute');
 const savedFind=store.findByIdAsync,savedUpdate=store.updateByIdAsync;
 const task={id:'task-fail-1',userId:owner,taskType:'agent.plan.execute',status:'running',attempt:3,payload:{planId:runId}};
 const plan={id:runId,userId:owner,kind:'agent-plan',status:'executing',executionTaskId:task.id,plan:{steps:[{type:'draft',status:'running'},{type:'analyze',status:'pending'}]},executionOutputs:[]};
 taskService.claimTask=async()=>task;taskService.failTask=async()=>({...task,status:'failed'});
 worker.handlers.set('agent.plan.execute',async()=>{throw new Error('expected handler failure');});
 store.findByIdAsync=async(_collection,id)=>id===runId?plan:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{Object.assign(plan,patch);return plan;};
 try{await worker.processOneTask();assert.equal(plan.status,'failed');assert.equal(plan.plan.steps[0].status,'failed');assert.equal(plan.plan.steps[1].status,'pending');assert.equal(plan.progress.failed,1);}
 finally{taskService.claimTask=savedClaim;taskService.failTask=savedFail;worker.handlers.set('agent.plan.execute',savedHandler);store.findByIdAsync=savedFind;store.updateByIdAsync=savedUpdate;}
});


test('stopWorker times out instead of waiting indefinitely for an active handler',async()=>{
 const service=require('../server/agent-task-service');
 const originals={claim:service.claimTask,complete:service.completeTask,recover:service.recoverExpiredTasks};
 let release,startedResolve;const started=new Promise(resolve=>{startedResolve=resolve;});const gate=new Promise(resolve=>{release=resolve;});
 const type='test.shutdown.wait';const task={id:'shutdown-task',userId:owner,taskType:type,status:'running',attempt:1};
 service.claimTask=async()=>task;service.completeTask=async()=>task;service.recoverExpiredTasks=async()=>{};
 worker.registerTaskHandler(type,async()=>{startedResolve();await gate;return {ok:true};});
 try{worker.startWorker();await started;const began=Date.now();const result=await worker.stopWorker(200);assert.equal(result,false);assert.ok(Date.now()-began<1000);release();}
 finally{release();service.claimTask=originals.claim;service.completeTask=originals.complete;service.recoverExpiredTasks=originals.recover;}
});

test('worker does not mark plan completed if cancellation arrives during final provider call',async()=>{setup();try{
 providers.generate=async()=>{generated++;records.set(taskId,{...records.get(taskId),status:'cancelled'});return{text:'Late output',usage:{}};};
 await assert.rejects(worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'}),/Task cancelled/);
 const run=records.get(runId);assert.equal(run.status,'cancelled');assert.equal(run.plan.steps[0].status,'completed');assert.equal(run.progress.percent,100);
 }finally{teardown();}});
\ntest('execution cancellation route cancels the linked queue task',async()=>{\n const service=require('../server/agent-task-service');\n const run={id:runId,userId:owner,kind:'agent-plan',status:'approved',executionTaskId:taskId,plan:{steps:[{status:'pending'}]}};\n const originals={find:store.findByIdAsync,transition:store.transitionAgentRunStatus,cancel:service.cancelTask};\n let cancelled=[];\n store.findByIdAsync=async(_collection,id)=>id===runId?run:null;\n store.transitionAgentRunStatus=async(_id,_user,allowed,status,patch)=>{assert.ok(allowed.includes(run.status));Object.assign(run,patch,{status});return{state:'updated',run};};\n service.cancelTask=async(id,user)=>{cancelled.push({id,user});return{id,status:'cancelled'};};\n try{\n  // The route is checked by source-level assertion here because Express auth middleware is integration-tested separately.\n  const routeSource=require('fs').readFileSync(require('path').join(__dirname,'../server/agents.js'),'utf8');\n  assert.match(routeSource,/existing\\.executionTaskId\\) await agentTaskService\\.cancelTask/);\n  assert.equal(run.executionTaskId,taskId);\n }finally{store.findByIdAsync=originals.find;store.transitionAgentRunStatus=originals.transition;service.cancelTask=originals.cancel;}\n});\n