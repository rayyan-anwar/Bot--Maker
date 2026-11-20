const test=require('node:test');
const assert=require('node:assert/strict');

test('embedding responses reject duplicate indexes and inconsistent dimensions',async()=>{
 const previous={enabled:process.env.BOTFORGE_EMBEDDINGS_ENABLED,key:process.env.OPENAI_API_KEY,fetch:global.fetch};
 process.env.BOTFORGE_EMBEDDINGS_ENABLED='true';process.env.OPENAI_API_KEY='test-only-key';
 const embeddings=require('../server/embeddings');
 try{
  global.fetch=async()=>({ok:true,status:200,json:async()=>({data:[
   {index:0,embedding:[0.1,0.2]},{index:0,embedding:[0.3,0.4]}
  ]})});
  await assert.rejects(embeddings.embedTexts(['one','two']),/duplicate vector indexes/);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({data:[
   {index:0,embedding:[0.1,0.2]},{index:1,embedding:[0.3]}
  ]})});
  await assert.rejects(embeddings.embedTexts(['one','two']),/inconsistent vector dimensions/);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({data:[
   {index:1,embedding:[0.3,0.4]},{index:0,embedding:[0.1,0.2]}
  ]})});
  assert.deepEqual(await embeddings.embedTexts(['one','two']),[[0.1,0.2],[0.3,0.4]]);
 }finally{
  if(previous.enabled===undefined)delete process.env.BOTFORGE_EMBEDDINGS_ENABLED;else process.env.BOTFORGE_EMBEDDINGS_ENABLED=previous.enabled;
  if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;
  global.fetch=previous.fetch;
 }
});

test('embedding batches preserve input order and reject cross-batch dimension drift',async()=>{
 const previous={enabled:process.env.BOTFORGE_EMBEDDINGS_ENABLED,key:process.env.OPENAI_API_KEY,fetch:global.fetch};
 process.env.BOTFORGE_EMBEDDINGS_ENABLED='true';process.env.OPENAI_API_KEY='test-only-key';
 const embeddings=require('../server/embeddings');
 try{
  let calls=0;
  global.fetch=async(_url,options)=>{
   const batch=JSON.parse(options.body).input,index=calls++;
   assert.equal(batch.length,index===0?64:1);
   const rows=batch.map((_,i)=>{const vectorIndex=batch.length-i-1;return {index:vectorIndex,embedding:[index*100+vectorIndex,index*100+vectorIndex]};});
   return {ok:true,status:200,json:async()=>({data:rows})};
  };
  const result=await embeddings.embedTexts(Array.from({length:65},(_,i)=>'document '+i));
  assert.equal(calls,2);assert.equal(result.length,65);
  assert.deepEqual(result[0],[0,0]);assert.deepEqual(result[63],[63,63]);assert.deepEqual(result[64],[100,100]);
  calls=0;
  global.fetch=async()=>{const index=calls++;return {ok:true,status:200,json:async()=>({data:[{index:0,embedding:index===0?[0.1,0.2]:[0.1,0.2,0.3]}]})};};
  await assert.rejects(embeddings.embedTexts(Array.from({length:65},(_,i)=>'batch '+i)),/inconsistent vector dimensions/);
 }finally{
  if(previous.enabled===undefined)delete process.env.BOTFORGE_EMBEDDINGS_ENABLED;else process.env.BOTFORGE_EMBEDDINGS_ENABLED=previous.enabled;
  if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;
  global.fetch=previous.fetch;
 }
});

test('embedding responses reject out-of-range indexes and missing data arrays',async()=>{
 const previous={enabled:process.env.BOTFORGE_EMBEDDINGS_ENABLED,key:process.env.OPENAI_API_KEY,fetch:global.fetch};
 process.env.BOTFORGE_EMBEDDINGS_ENABLED='true';process.env.OPENAI_API_KEY='test-only-key';
 const embeddings=require('../server/embeddings');
 try{
  global.fetch=async()=>({ok:true,status:200,json:async()=>({data:[{index:1,embedding:[0.1,0.2]}]})});
  await assert.rejects(embeddings.embedTexts(['one']),/invalid vector batch/);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({})});
  await assert.rejects(embeddings.embedTexts(['one']),/invalid vector batch/);
 }finally{
  if(previous.enabled===undefined)delete process.env.BOTFORGE_EMBEDDINGS_ENABLED;else process.env.BOTFORGE_EMBEDDINGS_ENABLED=previous.enabled;
  if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;
  global.fetch=previous.fetch;
 }
});

test('embedding requests have a bounded timeout and reject malformed vectors',async()=>{
 const previous={enabled:process.env.BOTFORGE_EMBEDDINGS_ENABLED,key:process.env.OPENAI_API_KEY,timeout:process.env.BOTFORGE_EMBEDDING_TIMEOUT_MS,fetch:global.fetch};
 process.env.BOTFORGE_EMBEDDINGS_ENABLED='true';
 process.env.OPENAI_API_KEY='test-only-key';
 process.env.BOTFORGE_EMBEDDING_TIMEOUT_MS='1000';
 const embeddings=require('../server/embeddings');
 try{
  global.fetch=async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));
  await assert.rejects(embeddings.embedTexts(['timeout test']),/timed out/);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({data:[{index:0,embedding:[0.1,Number.NaN]}]})});
  await assert.rejects(embeddings.embedTexts(['invalid vector']),/invalid vector batch/);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({data:[{index:0,embedding:[0.1,0.2]}]})});
  assert.deepEqual(await embeddings.embedTexts(['valid vector']),[[0.1,0.2]]);
 }finally{
  if(previous.enabled===undefined)delete process.env.BOTFORGE_EMBEDDINGS_ENABLED;else process.env.BOTFORGE_EMBEDDINGS_ENABLED=previous.enabled;
  if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;
  if(previous.timeout===undefined)delete process.env.BOTFORGE_EMBEDDING_TIMEOUT_MS;else process.env.BOTFORGE_EMBEDDING_TIMEOUT_MS=previous.timeout;
  global.fetch=previous.fetch;
 }
});
