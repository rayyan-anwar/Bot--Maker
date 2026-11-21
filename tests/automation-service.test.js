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
