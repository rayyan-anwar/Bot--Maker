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
