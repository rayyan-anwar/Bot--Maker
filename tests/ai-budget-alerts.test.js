'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateBudgetAlert}=require('../server/ai-budget-alerts');

test('budget alerts progress through normal, warning, critical and exhausted thresholds',()=>{
 assert.equal(evaluateBudgetAlert({limitAmount:100,reservedAmount:20,spentAmount:30}).status,'normal');
 assert.equal(evaluateBudgetAlert({limitAmount:100,reservedAmount:40,spentAmount:30}).status,'warning');
 assert.equal(evaluateBudgetAlert({limitAmount:100,reservedAmount:50,spentAmount:35}).status,'critical');
 assert.equal(evaluateBudgetAlert({limitAmount:100,reservedAmount:40,spentAmount:60}).status,'exhausted');
});
test('alert evaluation counts reserved and spent amounts together',()=>{
 const alert=evaluateBudgetAlert({limitAmount:200,reservedAmount:100,spentAmount:70});
 assert.equal(alert.percentUsed,85);assert.equal(alert.threshold,85);assert.equal(alert.level,'critical');
});
test('invalid values and zero limits fail closed as unknown alerts',()=>{
 for(const values of [{limitAmount:0},{limitAmount:-1},{limitAmount:10,reservedAmount:-1},{limitAmount:10,spentAmount:Infinity},{limitAmount:'invalid'}]){
  assert.equal(evaluateBudgetAlert(values).status,'unknown');
 }
});
test('over-budget usage is marked exhausted and retains over-100 percent',()=>{
 const alert=evaluateBudgetAlert({limitAmount:10,reservedAmount:2,spentAmount:11});
 assert.equal(alert.status,'exhausted');assert.equal(alert.percentUsed,130);
});
