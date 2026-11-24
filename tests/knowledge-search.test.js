'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const store=require('../server/store');
const {searchBotKnowledge}=require('../server/knowledge-search');
const botId='a1234567-1234-4234-9234-123456789abc';
const owner='owner-1';
const originalFindById=store.findByIdAsync, originalFindMany=store.findManyAsync;
test.afterEach(()=>{store.findByIdAsync=originalFindById;store.findManyAsync=originalFindMany;});
test('search returns ranked matching chunks only from owned bot documents',async()=>{
 store.findByIdAsync=async(collection,id)=>collection==='bots'&&id===botId?{id,ownerId:owner}:null;
 store.findManyAsync=async(collection,filters)=>collection==='documents'&&filters.botId===botId?[{id:'doc-1',botId,chunks:[{id:'c1',text:'Refund policy is 30 days for unopened products.'},{id:'c2',text:'Shipping is free for orders over 500 rupees.'}],filename:'policy.txt'}]:[];
 const result=await searchBotKnowledge({userId:owner,botId,query:'refund policy',limit:3});
 assert.equal(result.type,'knowledge-search');assert.equal(result.results[0].chunkId,'c1');assert.equal(result.results[0].filename,'policy.txt');
});
test('rejects access to bots not owned by the requesting user',async()=>{
 store.findByIdAsync=async()=>({id:botId,ownerId:'different-user'});store.findManyAsync=async()=>{throw new Error('must not read documents');};
 await assert.rejects(()=>searchBotKnowledge({userId:owner,botId,query:'secret'}),/access denied/);
});
test('validates query, bot id and result limit',async()=>{
 await assert.rejects(()=>searchBotKnowledge({userId:owner,botId,query:''}),/Query must contain/);
 await assert.rejects(()=>searchBotKnowledge({userId:owner,botId:'invalid',query:'valid'}),/valid botId/);
 await assert.rejects(()=>searchBotKnowledge({userId:owner,botId,query:'valid',limit:99}),/Limit must be/);
});
test('returns empty result for bots without documents',async()=>{
 store.findByIdAsync=async()=>({id:botId,ownerId:owner});store.findManyAsync=async()=>[];
 const result=await searchBotKnowledge({userId:owner,botId,query:'anything'});assert.deepEqual(result.results,[]);
});
