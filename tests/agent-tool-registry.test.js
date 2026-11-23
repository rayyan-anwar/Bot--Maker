'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getToolCatalog,validateToolRequest,executeSafeTool,MAX_ARGUMENT_BYTES,MAX_TEXT_CHARS}=require('../server/agent-tool-registry');

test('catalog reports only implemented safe tools as available',()=>{
 const catalog=getToolCatalog();
 assert.equal(catalog.length,5);
 assert.ok(catalog.every(tool=>tool.requiresApproval===true));
 assert.equal(catalog.find(tool=>tool.id==='text.analyze').executionAvailable,true);
 assert.equal(catalog.find(tool=>tool.id==='draft.create').executionAvailable,true);
 assert.equal(catalog.find(tool=>tool.id==='knowledge.search').executionAvailable,false);
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
test('safe text tool is allowed only with approved run and per-run approval',()=>{
 const result=validateToolRequest({toolId:'text.analyze',arguments:{text:'test'}},{runStatus:'approved',approvedToolIds:['text.analyze']});
 assert.equal(result.valid,true);
 assert.equal(result.executable,true);
});

test('text analyzer returns bounded safe metadata and preview',()=>{
 const result=executeSafeTool('text.analyze',{text:'Hello world.\nSecond line!'});
 assert.equal(result.type,'text-analysis');
 assert.equal(result.words,4);
 assert.equal(result.lines,2);
 assert.equal(result.sentences,2);
 assert.equal(result.preview,'Hello world.\nSecond line!');
 assert.throws(()=>executeSafeTool('text.analyze',{text:'x'.repeat(MAX_TEXT_CHARS+1)}),/12,000/);
});
test('draft tool validates content and returns review-only artifact',()=>{
 const draft=executeSafeTool('draft.create',{title:'Proposal',content:'Draft content'});
 assert.equal(draft.type,'draft');
 assert.equal(draft.status,'preview-only');
 assert.equal(draft.content,'Draft content');
 assert.throws(()=>executeSafeTool('draft.create',{title:'',content:'x'}),/Draft title/);
});

test('unimplemented knowledge search is not advertised as executable',()=>{
 const result=validateToolRequest({toolId:'knowledge.search',arguments:{botId:'owned-bot',query:'policy',limit:4}},{runStatus:'approved',approvedToolIds:['knowledge.search']});
 assert.equal(result.valid,false);assert.equal(result.executable,false);
 assert.ok(result.errors.some(error=>error.includes('not enabled')));
});
