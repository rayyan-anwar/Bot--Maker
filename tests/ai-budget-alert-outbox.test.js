'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {claimBudgetAlertOutbox,finishBudgetAlertOutbox}=require('../server/ai-budget-alert-outbox');

test('outbox adapter validates bounded claim parameters before querying',async()=>{
 let called=false;const query=async()=>{called=true;return {rows:[]}};
 await assert.rejects(()=>claimBudgetAlertOutbox(query,{batchSize:0}),RangeError);
 await assert.rejects(()=>claimBudgetAlertOutbox(query,{leaseSeconds:5}),RangeError);
 assert.equal(called,false);
});
test('outbox adapter forwards valid claim parameters and returns rows',async()=>{
 const rows=[{id:'event'}];let args;
 const result=await claimBudgetAlertOutbox(async(sql,values)=>{args={sql,values};return {rows}});
 assert.deepEqual(result,rows);assert.deepEqual(args.values,[20,60]);
});
test('outbox completion validates IDs, delivery state and retry bounds',async()=>{
 let called=false;const query=async()=>{called=true;return {rows:[{result:{updated:true}}]}};
 const id='123e4567-e89b-42d3-a456-426614174000';
 await assert.rejects(()=>finishBudgetAlertOutbox(query,'bad',{delivered:true}),TypeError);
 await assert.rejects(()=>finishBudgetAlertOutbox(query,id,{delivered:'yes'}),TypeError);
 await assert.rejects(()=>finishBudgetAlertOutbox(query,id,{delivered:false,retrySeconds:0}),RangeError);
 assert.equal(called,false);
 const result=await finishBudgetAlertOutbox(query,id,{delivered:false,error:'temporary failure',retrySeconds:120,maxAttempts:4});
 assert.deepEqual(result,{updated:true});
});
