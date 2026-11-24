'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const store=require('../server/store');
const providers=require('../server/providers');
const usage=require('../server/usage');
const worker=require('../server/agent-task-worker');
const fortisniEvents=require('../server/fortisni-events');

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
 const savedFind=store.findByIdAsync,savedUpdate=store.updateByIdAsync,savedTransition=store.transitionAgentRunStatus;
 const task={id:'task-fail-1',userId:owner,taskType:'agent.plan.execute',status:'running',attempt:3,payload:{planId:runId}};
 const plan={id:runId,userId:owner,kind:'agent-plan',status:'executing',executionTaskId:task.id,plan:{steps:[{type:'draft',status:'running'},{type:'analyze',status:'pending'}]},executionOutputs:[]};
 taskService.claimTask=async()=>task;taskService.failTask=async()=>({...task,status:'failed'});
 worker.handlers.set('agent.plan.execute',async()=>{throw new Error('expected handler failure');});
 store.findByIdAsync=async(_collection,id)=>id===runId?plan:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{Object.assign(plan,patch);return plan;};
 store.transitionAgentRunStatus=async(id,userId,from,to,extra={})=>{if(id!==plan.id||userId!==plan.userId)return{state:'not_found',run:null};if(!from.includes(plan.status))return{state:'conflict',run:plan};Object.assign(plan,extra,{status:to,updatedAt:new Date().toISOString()});return{state:'updated',run:plan};};
 try{await worker.processOneTask();assert.equal(plan.status,'failed');assert.equal(plan.plan.steps[0].status,'failed');assert.equal(plan.plan.steps[1].status,'pending');assert.equal(plan.progress.failed,1);assert.ok(plan.executionLogs.some(log=>log.event==='plan.failed'&&log.level==='error'));}
 finally{taskService.claimTask=savedClaim;taskService.failTask=savedFail;worker.handlers.set('agent.plan.execute',savedHandler);store.findByIdAsync=savedFind;store.updateByIdAsync=savedUpdate;store.transitionAgentRunStatus=savedTransition;}
});



test('recovered exhausted Agent Lab task marks its executing plan failed',async()=>{
 const savedFind=store.findByIdAsync,savedUpdate=store.updateByIdAsync,savedTransition=store.transitionAgentRunStatus;
 const task={id:'recovered-agent-task',userId:owner,taskType:'agent.plan.execute',status:'failed',payload:{planId:'recovered-agent-plan'}};
 const plan={id:'recovered-agent-plan',kind:'agent-plan',userId:owner,executionTaskId:task.id,status:'executing',plan:{steps:[
  {title:'Completed',status:'completed',completedAt:'2026-11-23T00:00:00.000Z'},
  {title:'Interrupted',status:'running'},
  {title:'Not started',status:'pending'}
 ]},executionOutputs:[{step:1,text:'done'}]};
 let transitionArgs=null;
 store.findByIdAsync=async(_collection,id)=>id===plan.id?plan:null;
 store.updateByIdAsync=async(_collection,id,patch)=>({...plan,...patch});
 store.transitionAgentRunStatus=async(...args)=>{transitionArgs=args;return {state:'updated',run:{...plan,status:'failed'}};};
 try{
  assert.equal(await worker.reconcileRecoveredAgentPlan(task),true);
  assert.equal(transitionArgs[3],'failed');
  assert.deepEqual(transitionArgs[4].plan.steps.map(step=>step.status),['completed','failed','failed']);
  assert.equal(transitionArgs[4].progress.completed,1);
  assert.equal(transitionArgs[4].progress.failed,2);
 }finally{store.findByIdAsync=savedFind;store.updateByIdAsync=savedUpdate;store.transitionAgentRunStatus=savedTransition;}
});

test('stopWorker times out instead of waiting indefinitely for an active handler',async()=>{
 const service=require('../server/agent-task-service');
 const originals={claim:service.claimTask,complete:service.completeTask,recover:service.recoverExpiredTasks};
 let release,startedResolve;const started=new Promise(resolve=>{startedResolve=resolve;});const gate=new Promise(resolve=>{release=resolve;});
 const type='test.shutdown.wait';const task={id:'shutdown-task',userId:owner,taskType:type,status:'running',attempt:1};
 service.claimTask=async()=>task;service.completeTask=async()=>task;service.recoverExpiredTasks=async()=>[];
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


test('scheduler completes fenced schedule claims and advances only the claimed slot',async()=>{
 const automation=require('../server/automation-service');
 const savedClaim=store.claimDueAutomationWorkflows,savedFinish=store.finishAutomationScheduleClaim,savedRun=automation.run;
 const workflow={id:'schedule-worker-1',userId:owner,nextRunAt:'2026-11-22T10:00:00.000Z',scheduleClaimSlot:'2026-11-22T10:00:00.000Z',scheduleClaimToken:'claim-token-1'};
 const calls=[];
 store.claimDueAutomationWorkflows=async()=>[workflow];
 store.finishAutomationScheduleClaim=async(...args)=>{calls.push(args);return {id:workflow.id};};
 automation.run=async(userId,id,data)=>{assert.equal(userId,owner);assert.equal(id,workflow.id);assert.deepEqual(data,{scheduled:true,scheduleSlot:workflow.scheduleClaimSlot});return{id:'task-1'};};
 try{
  await worker.enqueueDueSchedules();
  assert.deepEqual(calls,[[workflow.id,workflow.scheduleClaimSlot,'claim-token-1',true]]);
 }finally{store.claimDueAutomationWorkflows=savedClaim;store.finishAutomationScheduleClaim=savedFinish;automation.run=savedRun;}
});

test('scheduler releases a failed claim without advancing its schedule slot',async()=>{
 const automation=require('../server/automation-service');
 const savedClaim=store.claimDueAutomationWorkflows,savedFinish=store.finishAutomationScheduleClaim,savedRun=automation.run;
 const workflow={id:'schedule-worker-fail',userId:owner,scheduleClaimSlot:'2026-11-22T10:00:00.000Z',scheduleClaimToken:'claim-token-fail'};
 const calls=[];
 store.claimDueAutomationWorkflows=async()=>[workflow];
 store.finishAutomationScheduleClaim=async(...args)=>{calls.push(args);return null;};
 automation.run=async()=>{throw new Error('temporary queue failure');};
 try{
  await worker.enqueueDueSchedules();
  assert.deepEqual(calls,[[workflow.id,workflow.scheduleClaimSlot,'claim-token-fail',false]]);
 }finally{store.claimDueAutomationWorkflows=savedClaim;store.finishAutomationScheduleClaim=savedFinish;automation.run=savedRun;}
});


test('automation worker stops before the next step when workflow is disabled',async()=>{
 const automation=require('../server/automation-service');
 const savedGet=automation.getOwned,savedFind=store.findByIdAsync;
 const task={id:'automation-task-disabled',userId:owner,leaseOwner:'worker-1',payload:{workflowId:'workflow-disabled'}};
 const taskRow={id:task.id,status:'running',leaseOwner:task.leaseOwner,leaseExpiresAt:new Date(Date.now()+60000).toISOString()};
 let lookups=0;
 automation.getOwned=async()=>{lookups++;return lookups===1?{id:'workflow-disabled',name:'Two steps',enabled:true,steps:[{type:'text.analyze',arguments:{text:'first'}},{type:'text.analyze',arguments:{text:'second'}}]}:{id:'workflow-disabled',name:'Two steps',enabled:false,steps:[]};};
 store.findByIdAsync=async(_collection,id)=>id===task.id?taskRow:null;
 try{
  await assert.rejects(worker.handlers.get('automation.workflow.execute')(task),/disabled during execution/);
  assert.equal(lookups,2);
 }finally{automation.getOwned=savedGet;store.findByIdAsync=savedFind;}
});


test('automation worker stops if workflow definition changes between steps',async()=>{
 const automation=require('../server/automation-service');
 const savedGet=automation.getOwned,savedFind=store.findByIdAsync,savedExecute=worker.executeSafeTool;
 const task={id:'automation-task-edit',userId:owner,leaseOwner:'worker-1',payload:{workflowId:'workflow-edit'}};
 const taskRow={id:task.id,status:'running',leaseOwner:task.leaseOwner,leaseExpiresAt:new Date(Date.now()+60000).toISOString()};
 const originalSteps=[{type:'text.analyze',arguments:{text:'first'}},{type:'text.analyze',arguments:{text:'second'}}];
 let lookup=0,executions=0;
 automation.getOwned=async()=>{lookup++;return lookup===1?{id:'workflow-edit',name:'Original',enabled:true,updatedAt:'v1',steps:originalSteps}:{id:'workflow-edit',name:'Edited',enabled:true,updatedAt:'v2',steps:[...originalSteps,{type:'draft.create',arguments:{text:'changed'}}]};};
 store.findByIdAsync=async(_collection,id)=>id===task.id?taskRow:null;
 try{
  await assert.rejects(worker.executeAutomationWorkflow(task),/definition changed during execution/);
  assert.equal(lookup,2);
 }finally{automation.getOwned=savedGet;store.findByIdAsync=savedFind;if(savedExecute)worker.executeSafeTool=savedExecute;}
});

test('automation emits Fortisni step started and completed events',async()=>{
 const automation=require('../server/automation-service');
 const savedGet=automation.getOwned,savedFind=store.findByIdAsync,savedUpdate=store.updateByIdAsync,savedCheckpoint=store.saveAgentTaskCheckpoints,savedPublish=fortisniEvents.publish;
 const task={id:'automation-fortisni-events',userId:owner,leaseOwner:'worker-1',payload:{workflowId:'workflow-events'}};
 const taskRow={id:task.id,status:'running',leaseOwner:task.leaseOwner,leaseExpiresAt:new Date(Date.now()+60000).toISOString()};
 const workflow={id:'workflow-events',name:'Event workflow',enabled:true,updatedAt:'v1',steps:[{type:'text.analyze',arguments:{text:'hello'}}]};
 const events=[];
 automation.getOwned=async()=>workflow;
 store.findByIdAsync=async(_collection,id)=>id===task.id?taskRow:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{if(id!==task.id)return null;Object.assign(taskRow,patch);return taskRow;};
 store.saveAgentTaskCheckpoints=async(id,workerId,now,checkpoints)=>{if(id!==task.id||workerId!==task.leaseOwner||taskRow.status!=='running'||Date.parse(taskRow.leaseExpiresAt)<=now.getTime())return null;taskRow.executionCheckpoints=checkpoints;return taskRow;};
 fortisniEvents.publish=async(event)=>{events.push(event);return event;};
 try{
  const result=await worker.executeAutomationWorkflow(task);
  assert.equal(result.workflowId,workflow.id);
  assert.deepEqual(events.map(event=>event.type),['step.started','step.completed']);
  assert.deepEqual(events.map(event=>event.metadata.step),[1,1]);
 }finally{automation.getOwned=savedGet;store.findByIdAsync=savedFind;store.updateByIdAsync=savedUpdate;store.saveAgentTaskCheckpoints=savedCheckpoint;fortisniEvents.publish=savedPublish;}
});

test('automation execution continues when Fortisni event persistence fails',async()=>{
 const automation=require('../server/automation-service');
 const savedGet=automation.getOwned,savedFind=store.findByIdAsync,savedUpdate=store.updateByIdAsync,savedCheckpoint=store.saveAgentTaskCheckpoints,savedPublish=fortisniEvents.publish;
 const task={id:'automation-fortisni-failure',userId:owner,leaseOwner:'worker-1',payload:{workflowId:'workflow-event-failure'}};
 const taskRow={id:task.id,status:'running',leaseOwner:task.leaseOwner,leaseExpiresAt:new Date(Date.now()+60000).toISOString()};
 const workflow={id:'workflow-event-failure',name:'Event failure workflow',enabled:true,updatedAt:'v1',steps:[{type:'text.analyze',arguments:{text:'hello'}}]};
 automation.getOwned=async()=>workflow;
 store.findByIdAsync=async(_collection,id)=>id===task.id?taskRow:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{if(id!==task.id)return null;Object.assign(taskRow,patch);return taskRow;};
 store.saveAgentTaskCheckpoints=async(id,workerId,now,checkpoints)=>{if(id!==task.id||workerId!==task.leaseOwner||taskRow.status!=='running'||Date.parse(taskRow.leaseExpiresAt)<=now.getTime())return null;taskRow.executionCheckpoints=checkpoints;return taskRow;};
 fortisniEvents.publish=async()=>{throw new Error('event store unavailable');};
 try{
  const result=await worker.executeAutomationWorkflow(task);
  assert.equal(result.workflowId,workflow.id);
  assert.equal(result.results.length,1);
 }finally{automation.getOwned=savedGet;store.findByIdAsync=savedFind;store.updateByIdAsync=savedUpdate;store.saveAgentTaskCheckpoints=savedCheckpoint;fortisniEvents.publish=savedPublish;}
});

test('approved Agent Lab execution continues when Fortisni event persistence fails',async()=>{
 const savedFind=store.findByIdAsync,savedUpdate=store.updateByIdAsync,savedTransition=store.transitionAgentRunStatus,savedGenerate=providers.generate,savedConfigured=providers.isProviderConfigured,savedDefault=providers.getDefaultModel,savedReserve=usage.reserveAiBudget,savedSettle=usage.settleAiBudget,savedRelease=usage.releaseAiBudget,savedPublish=fortisniEvents.publish;
 const plan='agent-event-persistence-plan',task='agent-event-persistence-task';
 const steps=[{type:'analyze',title:'Analyze',description:'Analyze the input',status:'pending'}];
 const rows=new Map([[plan,{id:plan,userId:owner,kind:'agent-plan',status:'approved',goal:'Analyze input',provider:'openai',plan:{steps},progress:{total:1,completed:0,failed:0,running:0,pending:1,percent:0}}],[task,{id:task,userId:owner,kind:'agent-task',status:'running',leaseOwner:'worker-test',leaseExpiresAt:new Date(Date.now()+60000).toISOString(),payload:{planId:plan}}]]);
 let calls=0;
 store.findByIdAsync=async(_collection,id)=>rows.get(id)||null;
 store.updateByIdAsync=async(_collection,id,patch)=>{const row=rows.get(id);if(!row)return null;const next={...row,...patch};rows.set(id,next);return next;};
 store.transitionAgentRunStatus=async(id,userId,from,to,extra={})=>{const row=rows.get(id);if(!row||row.userId!==userId)return{state:'not_found'};if(!from.includes(row.status))return{state:'conflict',run:row};const next={...row,...extra,status:to};rows.set(id,next);return{state:'updated',run:next};};
 providers.isProviderConfigured=()=>true;providers.getDefaultModel=()=> 'test-model';providers.generate=async()=>{calls++;return{text:'Step output',usage:{}};};
 usage.reserveAiBudget=async()=>({reservationId:'test'});usage.settleAiBudget=async()=>true;usage.releaseAiBudget=async()=>true;
 fortisniEvents.publish=async()=>{throw new Error('events unavailable');};
 try{
  const result=await worker.executeApprovedPlan({id:task,userId:owner,payload:{planId:plan}},{workerId:'worker-test',isLeaseLost:()=>false});
  assert.equal(calls,1);
  assert.equal(result.stepsCompleted,1);
 }finally{store.findByIdAsync=savedFind;store.updateByIdAsync=savedUpdate;store.transitionAgentRunStatus=savedTransition;providers.generate=savedGenerate;providers.isProviderConfigured=savedConfigured;providers.getDefaultModel=savedDefault;usage.reserveAiBudget=savedReserve;usage.settleAiBudget=savedSettle;usage.releaseAiBudget=savedRelease;fortisniEvents.publish=savedPublish;}
});


test('automation worker aborts before execution when lease is already lost',async()=>{
 const automation=require('../server/automation-service');
 const savedGet=automation.getOwned,savedFind=store.findByIdAsync;
 const task={id:'automation-lease-lost',userId:owner,leaseOwner:'worker-1',payload:{workflowId:'workflow-lease-lost'}};
 const taskRow={id:task.id,status:'running',leaseOwner:task.leaseOwner,leaseExpiresAt:new Date(Date.now()+60000).toISOString()};
 let lookups=0;
 automation.getOwned=async()=>{lookups++;return{id:'workflow-lease-lost',name:'Lease test',enabled:true,steps:[{type:'text.analyze',arguments:{text:'must not run'}}]};};
 store.findByIdAsync=async(_collection,id)=>id===task.id?taskRow:null;
 try{
  await assert.rejects(worker.executeAutomationWorkflow(task,{workerId:'worker-1',isLeaseLost:()=>true}),/lease lost/);
  assert.equal(lookups,0);
 }finally{automation.getOwned=savedGet;store.findByIdAsync=savedFind;}
});



test('automation checkpoint writes require the current unexpired worker lease',async()=>{
 const taskId='automation-checkpoint-fence-'+Date.now();
 const task={id:taskId,kind:'agent-task',status:'running',leaseOwner:'worker-current',leaseExpiresAt:new Date(Date.now()+60000).toISOString(),userId:owner};
 store.insert('aiEngineerRuns',task);
 try{
  const checkpoints=[{step:1,result:{ok:true}}];
  const saved=await store.saveAgentTaskCheckpoints(taskId,'worker-current',new Date(),checkpoints);
  assert.deepEqual(saved.executionCheckpoints,checkpoints);
  assert.equal(await store.saveAgentTaskCheckpoints(taskId,'worker-stale',new Date(),[{step:2}]),null);
  const expired={...task,leaseExpiresAt:new Date(Date.now()-1000).toISOString()};
  store.updateById('aiEngineerRuns',taskId,expired);
  assert.equal(await store.saveAgentTaskCheckpoints(taskId,'worker-current',new Date(),[{step:3}]),null);
 }finally{store.deleteById('aiEngineerRuns',taskId);}
});

test('automation retries resume from durable step checkpoints without repeating completed steps',async()=>{
 const automation=require('../server/automation-service');
 const savedGet=automation.getOwned,savedFind=store.findByIdAsync,savedUpdate=store.updateByIdAsync,savedCheckpoint=store.saveAgentTaskCheckpoints;
 const task={id:'automation-checkpoint-task',userId:owner,leaseOwner:'worker-checkpoint',payload:{workflowId:'workflow-checkpoint'}};
 const workflow={id:'workflow-checkpoint',name:'Checkpoint workflow',enabled:true,updatedAt:'v1',steps:[
  {type:'text.analyze',arguments:{text:'first result'}},
  {type:'text.analyze',arguments:{text:'second result'}}
 ]};
 const prior={step:1,type:'text.analyze',result:{text:'first result'},completedAt:new Date().toISOString()};
 const taskRow={id:task.id,status:'running',leaseOwner:task.leaseOwner,leaseExpiresAt:new Date(Date.now()+60000).toISOString(),executionCheckpoints:[prior]};
 automation.getOwned=async()=>workflow;
 store.findByIdAsync=async(_collection,id)=>id===task.id?taskRow:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{Object.assign(taskRow,patch);return taskRow;};
 store.saveAgentTaskCheckpoints=async(id,workerId,now,checkpoints)=>{if(id!==task.id||workerId!==task.leaseOwner||taskRow.status!=='running'||Date.parse(taskRow.leaseExpiresAt)<=now.getTime())return null;taskRow.executionCheckpoints=checkpoints;return taskRow;};
 try{
  const result=await worker.executeAutomationWorkflow(task);
  assert.equal(result.completedSteps,2);
  assert.equal(Object.hasOwn(result,'results'),false);
  assert.equal(taskRow.executionCheckpoints.length,2);
  assert.equal(taskRow.executionCheckpoints[0].result.text,'first result');
  assert.equal(taskRow.executionCheckpoints[1].step,2);
 }finally{automation.getOwned=savedGet;store.findByIdAsync=savedFind;store.updateByIdAsync=savedUpdate;store.saveAgentTaskCheckpoints=savedCheckpoint;}
});


test('knowledge search always uses the authenticated task owner, not workflow-supplied identity',async()=>{
 let received;
 await worker.executeKnowledgeSearchForTask({userId:owner},{botId:'owned-bot',query:'private data',userId:'attacker-controlled-user'},async args=>{received=args;return {results:[]};});
 assert.equal(received.userId,owner);
 assert.equal(received.botId,'owned-bot');
 assert.equal(received.query,'private data');
});
