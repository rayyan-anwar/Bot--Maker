'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../server/store');
const service = require('../server/agent-task-service');

const original = {};
const records = [];
function setup() {
  for (const name of ['isPostgres','findManyAsync','findByIdAsync','insertAsync','insertAgentTaskIdempotent','insertAgentTaskWithinCapacity','updateByIdAsync','allAsync']) original[name]=store[name];
  store.isPostgres=()=>false;
  store.findManyAsync=async (_collection,filter={})=>records.filter(row=>Object.entries(filter).every(([k,v])=>row[k]===v));
  store.allAsync=async()=>records;
  store.findByIdAsync=async (_collection,id)=>records.find(row=>row.id===id)||null;
  store.insertAsync=async (_collection,row)=>{records.push(row);return row;};
  store.insertAgentTaskIdempotent=async row=>{const prior=records.find(x=>x.kind==='agent-task'&&x.userId===row.userId&&x.idempotencyKey===row.idempotencyKey);if(prior)return{created:false,record:prior};records.push(row);return{created:true,record:row};};
  store.insertAgentTaskWithinCapacity=async(row,maxActive)=>{if(row.idempotencyKey){const prior=records.find(x=>x.kind==='agent-task'&&x.userId===row.userId&&x.idempotencyKey===row.idempotencyKey);if(prior)return{created:false,record:prior};}const active=records.filter(x=>x.kind==='agent-task'&&x.userId===row.userId&&!['completed','failed','cancelled'].includes(x.status)).length;if(active>=maxActive)return{created:false,reason:'capacity'};records.push(row);return{created:true,record:row};};
  store.updateByIdAsync=async (_collection,id,patch)=>{const idx=records.findIndex(row=>row.id===id);if(idx<0)return null;records[idx]={...records[idx],...patch};return records[idx];};
}
function teardown(){for(const name of Object.keys(original))store[name]=original[name];records.length=0;}
test('durable task service validates and deduplicates owner-scoped enqueue',async()=>{
 setup();try{
  const a=await service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{goal:'hello'},idempotencyKey:'key'});
  const b=await service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{goal:'changed'},idempotencyKey:'key'});
  assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(a.task.id,b.task.id);
  assert.equal(await service.getTaskForUser(a.task.id,'u2'),null);
  await assert.rejects(service.enqueueTask({userId:'u1',taskType:'bad type',payload:{}}),/task type/);
  await assert.rejects(service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{data:'x'.repeat(34000)}}),/size limit/);
 }finally{teardown();}
});
test('durable tasks claim, heartbeat, complete and enforce owner visibility',async()=>{
 setup();try{
  const queued=await service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{goal:'x'}});
  const claimed=await service.claimTask('worker-1',new Date(Date.parse(queued.task.createdAt)+10));
  assert.equal(claimed.id,queued.task.id);assert.equal(claimed.status,'running');assert.equal(claimed.attempt,1);
  assert.equal(await service.heartbeatTask(claimed.id,'wrong-worker'),null);
  assert.ok(await service.heartbeatTask(claimed.id,'worker-1'));
  assert.equal(await service.completeTask(claimed.id,'wrong-worker',{ok:true}),null);
  const done=await service.completeTask(claimed.id,'worker-1',{ok:true});
  assert.equal(done.status,'completed');assert.deepEqual(done.result,{ok:true});
 }finally{teardown();}
});
test('durable task retry and lease expiry recovery respect attempt ceiling',async()=>{
 setup();try{
  const q=await service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{x:1}});
  const now=new Date(Date.parse(q.task.createdAt)+5);
  const first=await service.claimTask('w1',now);
  assert.equal((await service.failTask(first.id,'w1','temporary',new Date(now.getTime()+5),0)).status,'queued');
  const second=await service.claimTask('w2',new Date(now.getTime()+10));
  assert.equal(second.attempt,2);
  const recovered=await service.recoverExpiredTasks(new Date(Date.parse(second.leaseExpiresAt)+1));
  assert.equal(recovered.length,1);assert.equal(recovered[0].status,'queued');
  const third=await service.claimTask('w3',new Date(Date.parse(recovered[0].availableAt)+1));
  assert.equal(third.attempt,3);
  const terminal=await service.failTask(third.id,'w3','fatal',new Date(Date.parse(third.leaseExpiresAt)-1),0);
  assert.equal(terminal.status,'failed');
 }finally{teardown();}
});
test('durable task cancellation is user-scoped and terminal-state protected',async()=>{
 setup();try{
  const q=await service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{}});
  assert.equal(await service.cancelTask(q.task.id,'u2'),null);
  const cancelled=await service.cancelTask(q.task.id,'u1');
  assert.equal(cancelled.status,'cancelled');
  assert.equal(await service.cancelTask(q.task.id,'u1'),null);
 }finally{teardown();}
});

test('idempotent enqueue remains single-record under concurrent requests',async()=>{
 setup();try{const requests=await Promise.all(Array.from({length:12},()=>service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{goal:'same'},idempotencyKey:'parallel-key'})));assert.equal(records.length,1);assert.equal(requests.filter(x=>x.created).length,1);assert.ok(requests.every(x=>x.task.id===requests[0].task.id));}finally{teardown();}
});

test('claim rechecks task eligibility before updating the JSON fallback record',async()=>{
 setup();try{
  const q=await service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{goal:'race'}});
  const task=records[0];const originalFind=store.findByIdAsync;
  store.findByIdAsync=async(_collection,id)=>id===task.id?{...task,status:'cancelled'}:null;
  const claimed=await service.claimTask('worker-race',new Date(Date.parse(q.task.createdAt)+10));assert.equal(claimed,null);assert.equal(task.status,'queued');
  store.findByIdAsync=originalFind;
 }finally{teardown();}
});

test('parallel JSON fallback claims give one queued task to only one worker',async()=>{
 setup();try{
  const q=await service.enqueueTask({userId:'u1',taskType:'agent.plan',payload:{goal:'claim race'}});
  const at=new Date(Date.parse(q.task.createdAt)+10);
  const claims=await Promise.all([service.claimTask('worker-a',at),service.claimTask('worker-b',at)]);
  assert.equal(claims.filter(Boolean).length,1);
  assert.equal(records[0].status,'running');
 }finally{teardown();}
});

test('parallel JSON fallback enqueues cannot exceed the per-user active task cap',async()=>{
 setup();try{
  const requests=await Promise.allSettled(Array.from({length:service.MAX_TASKS_PER_USER+8},(_,index)=>service.enqueueTask({userId:'u-cap',taskType:'agent.plan',payload:{index}})));
  assert.equal(requests.filter(result=>result.status==='fulfilled').length,service.MAX_TASKS_PER_USER);
  assert.equal(requests.filter(result=>result.status==='rejected').length,8);
  assert.equal(records.filter(row=>row.userId==='u-cap'&&row.kind==='agent-task'&&!['completed','failed','cancelled'].includes(row.status)).length,service.MAX_TASKS_PER_USER);
 }finally{teardown();}
});

test('JSON fallback serializes completion against cancellation without terminal-state overwrite',async()=>{
 setup();try{
  const queued=await service.enqueueTask({userId:'u-race',taskType:'agent.plan',payload:{}});
  const claimed=await service.claimTask('worker-race',new Date(Date.parse(queued.task.createdAt)+5));
  const [completed,cancelled]=await Promise.all([
   service.completeTask(claimed.id,'worker-race',{ok:true},new Date(Date.parse(claimed.leaseExpiresAt)-1)),
   service.cancelTask(claimed.id,'u-race',new Date(Date.parse(claimed.leaseExpiresAt)-2))
  ]);
  const final=await store.findByIdAsync('aiEngineerRuns',claimed.id);
  assert.ok(['completed','cancelled'].includes(final.status));
  if(final.status==='completed'){assert.equal(completed.status,'completed');assert.equal(cancelled,null);}
  else {assert.equal(cancelled.status,'cancelled');assert.equal(completed,null);}
 }finally{teardown();}
});
test('JSON fallback lease recovery rechecks state before resetting an expired worker task',async()=>{
 setup();try{
  const queued=await service.enqueueTask({userId:'u-recover-race',taskType:'agent.plan',payload:{}});
  const claimed=await service.claimTask('worker-recover',new Date(Date.parse(queued.task.createdAt)+5));
  const expiry=new Date(Date.parse(claimed.leaseExpiresAt));
  const recovered=await service.recoverExpiredTasks(expiry);
  assert.equal(recovered.length,1);
  assert.equal(recovered[0].status,'queued');
  assert.equal(recovered[0].leaseOwner,null);
 }finally{teardown();}
});
