'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getToolCatalog,validateToolRequest,MAX_ARGUMENT_BYTES}=require('../server/agent-tool-registry');

test('catalog returns a bounded descriptive allowlist with execution disabled',()=>{
 const catalog=getToolCatalog();
 assert.equal(catalog.length,5);
 assert.ok(catalog.every(tool=>tool.requiresApproval===true&&tool.executionAvailable===false&&tool.enabled===false));
 assert.ok(catalog.every(tool=>typeof tool.id==='string'&&tool.id.length<=64));
});
test('unknown tool identifiers are rejected',()=>{
 const result=validateToolRequest({toolId:'shell.exec',arguments:{}},{runStatus:'approved',approvedToolIds:['shell.exec']});
 assert.equal(result.valid,false);
 assert.match(result.errors[0],/allowlisted/);
});
test('tool request is denied without an approved run and explicit per-run approval',()=>{
 const result=validateToolRequest({toolId:'knowledge.search',arguments:{query:'hello'}},{runStatus:'planned',approvedToolIds:[]});
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(error=>error.includes('approved')));
 assert.ok(result.errors.some(error=>error.includes('explicitly approved')));
});
test('write and external tool policies require corresponding permissions',()=>{
 const draft=validateToolRequest({toolId:'draft.create',arguments:{text:'draft'}},{runStatus:'approved',approvedToolIds:['draft.create']});
 assert.ok(draft.errors.some(error=>error.includes('write permission')));
 const web=validateToolRequest({toolId:'web.search',arguments:{query:'topic'}},{runStatus:'approved',approvedToolIds:['web.search']});
 assert.ok(web.errors.some(error=>error.includes('external access permission')));
});
test('arguments must be object and are bounded to 4 KB',()=>{
 assert.equal(validateToolRequest({toolId:'text.analyze',arguments:'text'},{runStatus:'approved',approvedToolIds:['text.analyze']}).valid,false);
 assert.ok(validateToolRequest({toolId:'text.analyze',arguments:{text:'x'.repeat(MAX_ARGUMENT_BYTES)}},{runStatus:'approved',approvedToolIds:['text.analyze']}).errors.some(error=>error.includes('4 KB')));
});
test('catalog-only tools cannot be executed even with context approval',()=>{
 const result=validateToolRequest({toolId:'text.analyze',arguments:{text:'test'}},{runStatus:'approved',approvedToolIds:['text.analyze']});
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(error=>error.includes('not enabled')));
 assert.equal(result.executable,false);
});
