'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {formatBudgetAlert}=require('../server/ai-budget-alert-message');

test('formats a bounded alert summary with currency and consumption',()=>{
 const result=formatBudgetAlert({status:'critical',scopeLabel:'Global budget',percentUsed:88.129,limitAmount:100,reservedAmount:20,spentAmount:68.13,currency:'USD'});
 assert.equal(result.title,'Budget critical');assert.equal(result.usage,'88.13%');
 assert.equal(result.limit,'100.00 USD');assert.equal(result.reserved,'20.00 USD');
 assert.equal(result.spent,'68.13 USD');
});
test('unknown status and invalid numbers fail closed into unavailable labels',()=>{
 const result=formatBudgetAlert({status:'unexpected',scopeLabel:'scope',percentUsed:NaN,limitAmount:-5,reservedAmount:-1,spentAmount:'bad'});
 assert.equal(result.status,'unknown');assert.equal(result.usage,'unavailable');
 assert.equal(result.limit,'unavailable');assert.equal(result.reserved,'unavailable');assert.equal(result.spent,'unavailable');
});
test('untrusted scope text is stripped of markup and line breaks',()=>{
 const result=formatBudgetAlert({status:'warning',scopeLabel:'<admin>\\nInjected\\tText',percentUsed:70,limitAmount:10,currency:'INR'});
 assert.equal(result.scope,'admin Injected Text');
});
test('long scope labels are capped and missing currency does not fabricate one',()=>{
 const result=formatBudgetAlert({status:'warning',scopeLabel:'x'.repeat(500),percentUsed:70,limitAmount:50});
 assert.equal(result.scope.length,120);assert.equal(result.limit,'50.00');
});
