const test=require('node:test');
const assert=require('node:assert/strict');
const providers=require('../server/providers');

async function withEnv(values,fn){
 const before={};
 for(const key of Object.keys(values)){
  before[key]=process.env[key];
  if(values[key]===undefined)delete process.env[key];else process.env[key]=String(values[key]);
 }
 try{return await fn();}finally{
  for(const key of Object.keys(values)){
   if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];
  }
 }
}
async function withFetch(mock,fn){
 const original=global.fetch;global.fetch=mock;
 try{return await fn();}finally{global.fetch=original;}
}
function response(data,{ok=true,status=200}={}){
 return {ok,status,json:async()=>data};
}

test('Anthropic adapter sends system and conversation and returns token usage',async()=>{
 await withEnv({ANTHROPIC_API_KEY:'anthropic-test-key'},()=>withFetch(async(url,options)=>{
  assert.equal(url,'https://api.anthropic.com/v1/messages');
  assert.equal(options.headers['x-api-key'],'anthropic-test-key');
  const body=JSON.parse(options.body);
  assert.equal(body.system,'Be concise.');
  assert.deepEqual(body.messages,[{role:'user',content:'Hello'}]);
  return response({content:[{type:'text',text:'Hi there'}],usage:{input_tokens:4,output_tokens:2}});
 },async()=>{
  const result=await providers.generate({provider:'anthropic',system:'Be concise.',messages:[{role:'user',content:'Hello'}]});
  assert.deepEqual(result,{text:'Hi there',inputTokens:4,outputTokens:2});
 }));
});

test('OpenAI adapter sends Responses API input and extracts output text',async()=>{
 await withEnv({OPENAI_API_KEY:'openai-test-key'},()=>withFetch(async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(options.headers.authorization,'Bearer openai-test-key');
  const body=JSON.parse(options.body);
  assert.equal(body.input[0].role,'system');
  assert.equal(body.input[1].role,'user');
  return response({output_text:'A clear answer',usage:{input_tokens:7,output_tokens:3}});
 },async()=>{
  const result=await providers.generate({provider:'openai',system:'Rules',messages:[{role:'user',content:'Question'}]});
  assert.deepEqual(result,{text:'A clear answer',inputTokens:7,outputTokens:3});
 }));
});

test('Gemini adapter encodes model and API key and maps assistant role',async()=>{
 await withEnv({GOOGLE_GEMINI_API_KEY:'gemini test key'},()=>withFetch(async(url,options)=>{
  assert.match(url,/models\/gemini-3\.8-flash:generateContent\?key=gemini%20test%20key$/);
  const body=JSON.parse(options.body);
  assert.deepEqual(body.contents,[{role:'model',parts:[{text:'Previous answer'}]},{role:'user',parts:[{text:'Next question'}]}]);
  return response({candidates:[{content:{parts:[{text:'Gemini answer'}]}}],usageMetadata:{promptTokenCount:9,candidatesTokenCount:5}});
 },async()=>{
  const result=await providers.generate({provider:'gemini',system:'System rules',messages:[{role:'assistant',content:'Previous answer'},{role:'user',content:'Next question'}]});
  assert.deepEqual(result,{text:'Gemini answer',inputTokens:9,outputTokens:5});
 }));
});

test('provider failures expose a safe public error and retain bounded diagnostic detail',async()=>{
 await withEnv({ANTHROPIC_API_KEY:'anthropic-test-key'},()=>withFetch(async()=>response({error:{message:'provider diagnostic'}},{ok:false,status:429}),async()=>{
  await assert.rejects(()=>providers.generate({provider:'anthropic',messages:[],system:''}),error=>{
   assert.equal(error.status,429);
   assert.equal(error.message,'Anthropic request failed (429).');
   assert.equal(error.providerMessage,'provider diagnostic');
   return true;
  });
 }));
});

test('provider timeout aborts the in-flight request',async()=>{
 await withEnv({ANTHROPIC_API_KEY:'anthropic-test-key'},()=>withFetch((_url,{signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error);},{once:true});
 }),async()=>{
  await assert.rejects(()=>providers.generate({provider:'anthropic',messages:[],system:'',timeoutMs:5}),/timed out/i);
 }));
});

test('unsupported and unconfigured providers fail before making a network request',async()=>{
 await withEnv({ANTHROPIC_API_KEY:undefined},()=>withFetch(async()=>{throw new Error('fetch must not be called');},async()=>{
  await assert.rejects(()=>providers.generate({provider:'unknown',messages:[],system:''}),/Unsupported AI provider/);
  await assert.rejects(()=>providers.generate({provider:'anthropic',messages:[],system:''}),/not configured/);
 }));
});
