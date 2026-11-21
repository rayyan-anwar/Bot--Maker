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
test('approved plan worker completes step and persists output',async()=>{setup();try{const result=await worker.executeApprovedPlan(records.get(taskId),{workerId:'test-worker'});assert.equal(result.stepsCompleted,1);assert.equal(generated,1);const run=records.get(runId);assert.equal(run.status,'completed');assert.equal(run.plan.steps[0].status,'completed');assert.equal(run.executionOutputs[0].text,'Completed draft output');}finally{teardown();}});
test('approved plan worker rejects task owner mismatch',async()=>{setup();try{const task={...records.get(taskId),userId:'intruder'};await assert.rejects(worker.executeApprovedPlan(task,{workerId:'test-worker'}),/not found for task owner/);assert.equal(generated,0);}finally{teardown();}});
