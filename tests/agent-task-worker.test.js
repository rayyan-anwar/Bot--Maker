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
 for(const name of ['findByIdAsync','updateByIdAsync','transitionAgentRunStatus'])originals[name]=store[name];
 for(const name of ['isProviderConfigured','getDefaultModel','generate'])originals['providers_'+name]=providers[name];
 for(const name of ['reserveAiBudget','settleAiBudget','releaseAiBudget'])originals['usage_'+name]=usage[name];
 records.set(runId,{id:runId,userId:owner,kind:'agent-plan',status:'approved',goal:'Write a short overview',provider:'openai',plan:{steps:[{type:'draft',title:'Draft',description:'Write a short overview',status:'pending'}]},progress:{total:1,completed:0,failed:0,running:0,pending:1,percent:0}});
 records.set(taskId,{id:taskId,userId:owner,kind:'agent-task',status:'running',leaseOwner:'test-worker',leaseExpiresAt:new Date(Date.now()+60000).toISOString(),payload:{planId:runId}});
 store.findByIdAsync=async(_collection,id)=>records.get(id)||null;
 store.updateByIdAsync=async(_collection,id,patch)=>{const row=records.get(id);if(!row)return null;const next={...row,...patch};records.set(id,next);return next;};
 store.transitionAgentRunStatus=async(id,userId,from,to,extra={})=>{const row=records.get(id);if(!row||row.userId!==userId||row.kind!=='agent-plan')return{state:'not_found',run:null};if(!from.includes(row.status))return{state:'conflict',run:row};const next={...row,...extra,status:to,updatedAt:new Date().toISOString()};records.set(id,next);return{state:'updated',run:next};};
 providers.isProviderConfigured=()=>true;providers.getDefaultModel=()=> 'test-model';providers.generate=async()=>{generated++;return{text:'Completed draft output',usage:{}};};
 usage.reserveAiBudget=async()=>({reservationId:'reserve'});usage.settleAiBudget=async()=>true;usage.releaseAiBudget=async()=>true;
 generated=0;
}
function teardown(){for(const name of ['findByIdAsync','updateByIdAsync','transitionAgentRunStatus'])store[name]=originals[name];for(const name of ['isProviderConfigured','getDefaultModel','generate'])providers[name]=originals['providers_'+name];for(const name of ['reserveAiBudget','settleAiBudget','releaseAiBudget'])usage[name]=originals['usage_'+name];records.clear();}
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
 try{await worker.processOneTask();assert.equal(plan.status,'failed');assert.equal(plan.plan.steps[0].status,'failed');assert.equal(plan.plan.steps[1].status,'pending');assert.equal(plan.progress.failed,1);assert.ok(plan.executionLogs.some(log=>log.event==='plan.failed'&&log.level==='error'));}
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
 const run=records.get(runId);assert.equal(run.status,'cancelled');assert.equal(run.plan.steps[0].status,'cancelled');assert.equal(run.progress.running,0);assert.equal(run.progress.pending,0);assert.equal(run.progress.percent,0);
 }finally{teardown();}});

test('execution cancellation route delegates cancellation to its linked task',()=>{
 const source=require('fs').readFileSync(require('path').join(__dirname,'../server/agents.js'),'utf8');
 assert.ok(source.includes('agentTaskService.cancelTask(existing.executionTaskId, req.user.id)'));
 assert.match(source, /\['planned', 'approved', 'executing'\], 'cancelled'/);
});

test('worker preserves plan cancellation state when provider fails after cancellation',async()=>{setup();try{
 providers.generate=async()=>{generated++;const run=records.get(runId);records.set(runId,{...run,status:'cancelled',plan:{...run.plan,steps:run.plan.steps.map(step=>({...step,status:'cancelled'}))}});throw new Error('provider returned after cancellation');};
 await assert.rejects(worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'}),/provider returned after cancellation/);
 const run=records.get(runId);assert.equal(run.status,'cancelled');assert.equal(run.plan.steps[0].status,'cancelled');
 }finally{teardown();}
});

test('provider cancellation updates the plan even when the provider call rejects',async()=>{setup();try{
 providers.generate=async()=>{generated++;records.set(taskId,{...records.get(taskId),status:'cancelled',leaseOwner:null,leaseExpiresAt:null});throw new Error('provider request aborted after cancellation');};
 await assert.rejects(worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'}),/provider request aborted/);
 const run=records.get(runId);assert.equal(run.status,'cancelled');assert.equal(run.plan.steps[0].status,'cancelled');assert.equal(run.progress.running,0);assert.equal(run.progress.pending,0);
 }finally{teardown();}});
test('provider usage settlement failure retains the AI budget hold for reconciliation',async()=>{setup();try{
 let releases=0;usage.settleAiBudget=async()=>{throw new Error('provider token usage is missing');};usage.releaseAiBudget=async()=>{releases++;return true;};
 await assert.rejects(worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'}),/provider token usage is missing/);
 assert.equal(releases,0);assert.equal(records.get(runId).plan.steps[0].status,'pending');
 }finally{teardown();}});
test('provider cancellation never resets a cancelled task step to pending',async()=>{setup();try{
 providers.generate=async()=>{generated++;records.set(taskId,{...records.get(taskId),status:'cancelled',leaseOwner:null,leaseExpiresAt:null});throw new Error('cancelled while provider was running');};
 await assert.rejects(worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'}),/cancelled while provider/);
 assert.equal(records.get(runId).plan.steps[0].status,'cancelled');
 }finally{teardown();}});

test('worker does not finalize a plan after its lease expires between final step and plan completion',async()=>{setup();try{
 const originalFind=store.findByIdAsync;let taskReads=0;
 store.findByIdAsync=async(collection,id)=>{
  const row=await originalFind(collection,id);
  if(id===taskId&&++taskReads===3)return {...row,leaseExpiresAt:new Date(Date.now()-1000).toISOString()};
  return row;
 };
 await assert.rejects(worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'}),/lease lost before plan completion/);
 assert.equal(records.get(runId).status,'executing');
 assert.equal(records.get(runId).plan.steps[0].status,'completed');
 }finally{teardown();}});

test('atomic plan terminal transition cannot overwrite a concurrent cancellation',async()=>{setup();try{
 const run=records.get(runId);
 records.set(runId,{...run,status:'cancelled'});
 const result=await store.transitionAgentRunStatus(runId,owner,['executing'],'completed',{completedAt:new Date().toISOString()});
 assert.equal(result.state,'conflict');
 assert.equal(records.get(runId).status,'cancelled');
 }finally{teardown();}});
