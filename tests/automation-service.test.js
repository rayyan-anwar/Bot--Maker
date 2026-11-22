'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const service=require('../server/automation-service');
const store=require('../server/store');

test('automation definitions reject unsafe tool types and oversized workflows',()=>{
 assert.throws(()=>service.validateDefinition({name:'Bad',steps:[{type:'web.search'}]}),/Unsupported workflow step/);
 assert.throws(()=>service.validateDefinition({name:'Too many',steps:Array.from({length:9},()=>({type:'text.analyze'}))}),/1 to 8 steps/);
 assert.throws(()=>service.validateDefinition({name:'Bad schedule',steps:[{type:'text.analyze'}],trigger:{type:'schedule',intervalMinutes:1}}),/15 to 10080/);
});
test('automation definitions normalize supported steps and triggers',()=>{
 const result=service.validateDefinition({name:'Daily review',steps:[{type:'text.analyze',arguments:{text:'hello'}}],trigger:{type:'schedule',intervalMinutes:60}});
 assert.equal(result.name,'Daily review');
 assert.equal(result.steps.length,1);
 assert.equal(result.trigger.type,'schedule');
 assert.equal(result.trigger.intervalMinutes,60);
 assert.equal(typeof result.steps[0].id,'string');
});
test('workflow ownership lookup never returns another user workflow',async()=>{
 const original=store.findByIdAsync;
 store.findByIdAsync=async(_collection,id)=>id==='workflow-1'?{id,kind:'automation-workflow',userId:'owner-1',enabled:true}:null;
 try{
  assert.equal(await service.getOwned('owner-1','workflow-1') instanceof Object,true);
  assert.equal(await service.getOwned('attacker','workflow-1'),null);
 }finally{store.findByIdAsync=original;}
});

test('scheduled workflow runs reuse the scheduler-observed slot as an idempotency key',async()=>{
 const originalFind=store.findByIdAsync,originalUpdate=store.updateByIdAsync,originalEnqueue=require('../server/agent-task-service').enqueueTask;
 const workflow={id:'schedule-1',kind:'automation-workflow',userId:'owner',enabled:true,trigger:{type:'schedule',intervalMinutes:60},nextRunAt:'2026-11-22T10:00:00.000Z'};
 const keys=[];
 store.findByIdAsync=async(_collection,id)=>id===workflow.id?{...workflow}:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{Object.assign(workflow,patch);return workflow;};
 require('../server/agent-task-service').enqueueTask=async args=>{keys.push(args.idempotencyKey);return{created:keys.length===1,task:{id:'task-'+keys.length}};};
 try{
  await service.run('owner',workflow.id,{scheduled:true,scheduleSlot:'2026-11-22T10:00:00.000Z'});
  await service.run('owner',workflow.id,{scheduled:true,scheduleSlot:'2026-11-22T10:00:00.000Z'});
  assert.equal(keys.length,2);
  assert.equal(keys[0],keys[1]);
  assert.equal(keys[0],'automation:schedule-1:schedule:2026-11-22T10:00:00.000Z');
 }finally{
  store.findByIdAsync=originalFind;store.updateByIdAsync=originalUpdate;
  require('../server/agent-task-service').enqueueTask=originalEnqueue;
 }
});

test('concurrent scheduled workflow runs advance a schedule slot only once',async()=>{
 const originalFind=store.findByIdAsync,originalUpdate=store.updateByIdAsync,originalEnqueue=require('../server/agent-task-service').enqueueTask;
 const slot='2026-11-22T10:00:00.000Z';
 const workflow={id:'schedule-race',kind:'automation-workflow',userId:'owner',enabled:true,trigger:{type:'schedule',intervalMinutes:60},nextRunAt:slot};
 const keys=[];
 store.findByIdAsync=async(_collection,id)=>id===workflow.id?{...workflow}:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{if(patch.nextRunAt&&workflow.nextRunAt===slot)Object.assign(workflow,patch);else Object.assign(workflow,Object.fromEntries(Object.entries(patch).filter(([key])=>key!=='nextRunAt')));return workflow;};
 require('../server/agent-task-service').enqueueTask=async args=>{keys.push(args.idempotencyKey);return{created:keys.length===1,task:{id:'task-'+keys.length}};};
 try{
  await Promise.all(Array.from({length:8},()=>service.run('owner',workflow.id,{scheduled:true,scheduleSlot:slot})));
  assert.equal(new Set(keys).size,1);
  assert.equal(keys.length,8);
  assert.equal(workflow.nextRunAt,new Date(Date.parse(slot)+60*60000).toISOString());
 }finally{store.findByIdAsync=originalFind;store.updateByIdAsync=originalUpdate;require('../server/agent-task-service').enqueueTask=originalEnqueue;}
});


test('automation validator rejects unknown trigger fields and oversized step arguments',()=>{
 assert.throws(()=>service.validateDefinition({name:'Too big',steps:[{type:'draft.create',arguments:{data:'x'.repeat(4100)}}]}),/arguments are too large/);
 assert.throws(()=>service.validateDefinition({name:'Bad trigger',steps:[{type:'text.analyze'}],trigger:{type:'cron'}}),/manual, webhook or schedule/);
});

test('automation validator does not retain caller-owned argument objects',()=>{
 const args={text:'original',nested:{value:1}};
 const result=service.validateDefinition({name:'Clone test',steps:[{type:'text.analyze',arguments:args}]});
 args.nested.value=99;args.text='mutated';
 assert.equal(result.steps[0].arguments.text,'original');assert.equal(result.steps[0].arguments.nested.value,1);
});

test('automation validator rejects circular and non-JSON step arguments with clear errors',()=>{
 const circular={};circular.self=circular;
 assert.throws(()=>service.validateDefinition({name:'Circular',steps:[{type:'text.analyze',arguments:circular}]}),/valid JSON data/);
 assert.throws(()=>service.validateDefinition({name:'BigInt',steps:[{type:'text.analyze',arguments:{value:1n}}]}),/valid JSON data/);
});


test('automation validator rejects undefined, functions, non-finite numbers and deep arguments',()=>{
 assert.throws(()=>service.validateDefinition({name:'Undefined',steps:[{type:'text.analyze',arguments:{value:undefined}}]}),/valid JSON data/);
 assert.throws(()=>service.validateDefinition({name:'Function',steps:[{type:'text.analyze',arguments:{value:()=>1}}]}),/valid JSON data/);
 assert.throws(()=>service.validateDefinition({name:'NaN',steps:[{type:'text.analyze',arguments:{value:NaN}}]}),/valid JSON data/);
 let deep={};let cursor=deep;for(let i=0;i<22;i++){cursor.next={};cursor=cursor.next;}
 assert.throws(()=>service.validateDefinition({name:'Deep',steps:[{type:'text.analyze',arguments:deep}]}),/valid JSON data/);
});


test('public webhook lookup returns only webhook workflows and does not require owner lookup',async()=>{
 const original=store.findByIdAsync;
 store.findByIdAsync=async(_collection,id)=>id==='hook-1'?{id,kind:'automation-workflow',userId:'owner',trigger:{type:'webhook',secret:'private-secret'}}:id==='schedule-1'?{id,kind:'automation-workflow',userId:'owner',trigger:{type:'schedule',intervalMinutes:60}}:null;
 try{
  const hook=await service.getWebhookWorkflow('hook-1');assert.equal(hook.userId,'owner');assert.equal(hook.trigger.type,'webhook');
  assert.equal(await service.getWebhookWorkflow('schedule-1'),null);
  assert.equal(await service.getWebhookWorkflow('missing'),null);
 }finally{store.findByIdAsync=original;}
});

test('webhook endpoint is secret-authenticated without requiring session auth',()=>{
 const source=require('fs').readFileSync(require('path').join(__dirname,'../server/automation-routes.js'),'utf8');
 assert.match(source,/router\.post\('\/:id\/webhook',async/);
 assert.match(source,/x-botforge-webhook-secret/);
 assert.match(source,/timingSafeEqual/);
 assert.match(source,/getWebhookWorkflow/);
 assert.match(source,/service\.run\(workflow\.userId/);
});


test('manual automation trigger request IDs deduplicate retried requests',async()=>{
 const originalFind=store.findByIdAsync,originalUpdate=store.updateByIdAsync,originalEnqueue=require('../server/agent-task-service').enqueueTask;
 const workflow={id:'request-dedupe',kind:'automation-workflow',userId:'owner',enabled:true,trigger:{type:'manual'},steps:[],nextRunAt:null};const keys=[];
 store.findByIdAsync=async(_collection,id)=>id===workflow.id?{...workflow}:null;
 store.updateByIdAsync=async(_collection,id,patch)=>{Object.assign(workflow,patch);return workflow;};
 require('../server/agent-task-service').enqueueTask=async args=>{keys.push(args.idempotencyKey);return{created:keys.length===1,task:{id:'same-task'}};};
 try{const first=await service.run('owner',workflow.id,{},'client-request-123');const retry=await service.run('owner',workflow.id,{},'client-request-123');assert.equal(first.id,retry.id);assert.equal(keys[0],keys[1]);assert.equal(keys[0],'automation:request-dedupe:request:client-request-123');await assert.rejects(service.run('owner',workflow.id,{},'x'.repeat(101)),/Invalid automation request ID/);}
 finally{store.findByIdAsync=originalFind;store.updateByIdAsync=originalUpdate;require('../server/agent-task-service').enqueueTask=originalEnqueue;}
});

test('automation JSON validation rejects sparse arrays, accessors, symbols and unsafe object keys',()=>{
 const sparse=[];sparse.length=2;sparse[1]='valid';
 assert.throws(()=>service.validateDefinition({name:'Sparse',steps:[{type:'text.analyze',arguments:{items:sparse}}]}),/valid JSON data/);
 const getter={};Object.defineProperty(getter,'secret',{enumerable:true,get(){throw new Error('getter executed');}});
 assert.throws(()=>service.validateDefinition({name:'Getter',steps:[{type:'text.analyze',arguments:getter}]}),/valid JSON data/);
 const symbolArg={text:'ok'};symbolArg[Symbol('hidden')]='bad';
 assert.throws(()=>service.validateDefinition({name:'Symbol',steps:[{type:'text.analyze',arguments:symbolArg}]}),/valid JSON data/);
 const unsafe=JSON.parse('{"constructor":{"prototype":{"polluted":true}}}');
 assert.throws(()=>service.validateDefinition({name:'Unsafe key',steps:[{type:'text.analyze',arguments:unsafe}]}),/valid JSON data/);
});
test('schedule intervals must be numeric and trigger data must be bounded JSON',async()=>{
 assert.throws(()=>service.validateDefinition({name:'String interval',steps:[{type:'text.analyze'}],trigger:{type:'schedule',intervalMinutes:'60'}}),/15 to 10080/);
 const original=store.findByIdAsync;store.findByIdAsync=async()=>({id:'s',kind:'automation-workflow',userId:'owner',enabled:true,trigger:{type:'schedule',intervalMinutes:60},nextRunAt:'2026-11-22T10:00:00.000Z'});
 try{
  await assert.rejects(service.run('owner','s',{scheduled:true,scheduleSlot:'not-a-date'}),/Invalid automation schedule slot/);
  await assert.rejects(service.run('owner','s',{payload:'x'.repeat(9000)}),/Invalid automation trigger data/);
 }finally{store.findByIdAsync=original;}
});

test('workflow JSON validation rejects extra enumerable array properties',()=>{
 const args={items:['ok']};args.items.extra='unsafe';
 assert.throws(()=>service.validateDefinition({name:'Extra array prop',steps:[{type:'text.analyze',arguments:args}]}),/valid JSON data/);
});
