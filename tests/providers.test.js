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
  assert.match(url,/models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(options.headers['x-goog-api-key'],'gemini test key');
  assert.equal(url.includes('gemini test key'),false);
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

test('mock provider returns a deterministic local response only when explicitly enabled outside production',async()=>{
 await withEnv({NODE_ENV:'test',BOTFORGE_ENABLE_MOCK_PROVIDER:'true'},async()=>{
  const result=await providers.generate({provider:'mock',messages:[{role:'user',content:'Test prompt'}]});
  assert.match(result.text,/local test response/i);
  assert.match(result.text,/Test prompt/);
  assert.equal(result.inputTokens,0);
  assert.equal(result.outputTokens,0);
  assert.equal(providers.isProviderConfigured('mock'),true);
 });
});
test('mock provider is unavailable in production and when not explicitly enabled',async()=>{
 await withEnv({NODE_ENV:'production',BOTFORGE_ENABLE_MOCK_PROVIDER:'true'},async()=>{
  assert.equal(providers.isProviderConfigured('mock'),false);
  await assert.rejects(()=>providers.generate({provider:'mock',messages:[{role:'user',content:'No'}]}),/mock provider is disabled/i);
 });
 await withEnv({NODE_ENV:'development',BOTFORGE_ENABLE_MOCK_PROVIDER:undefined},async()=>{
  assert.equal(providers.isProviderConfigured('mock'),false);
 });
});


test('Anthropic streaming adapter emits text deltas and final token usage',async()=>{
 await withEnv({ANTHROPIC_API_KEY:'anthropic-stream-key'},()=>withFetch(async(url,options)=>{
  assert.equal(url,'https://api.anthropic.com/v1/messages');
  assert.equal(JSON.parse(options.body).stream,true);
  const encoder=new TextEncoder();
  const chunks=[
   'event: message_start\ndata: '+JSON.stringify({type:'message_start',message:{usage:{input_tokens:11}}})+'\n\n',
   'event: content_block_delta\ndata: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:'Hello '}})+'\n\n',
   'event: content_block_delta\ndata: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:'world'}})+'\n\n',
   'event: message_delta\ndata: '+JSON.stringify({type:'message_delta',usage:{output_tokens:4}})+'\n\n'
  ];
  return {ok:true,status:200,body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(encoder.encode(chunk));controller.close();}})};
 },async()=>{
  const tokens=[];const result=await providers.generateStream({provider:'anthropic',system:'Rules',messages:[{role:'user',content:'Hi'}],onToken:token=>tokens.push(token)});
  assert.deepEqual(tokens,['Hello ','world']);
  assert.deepEqual(result,{text:'Hello world',inputTokens:11,outputTokens:4});
 }));
});


test('OpenAI streaming adapter emits Responses API deltas and final token usage',async()=>{
 await withEnv({OPENAI_API_KEY:'openai-stream-key'},()=>withFetch(async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(options.body).stream,true);
  const encoder=new TextEncoder();
  const chunks=[
   'event: response.output_text.delta\r\ndata: '+JSON.stringify({type:'response.output_text.delta',delta:'OpenAI '})+'\r\n\r\n',
   'event: response.output_text.delta\r\ndata: '+JSON.stringify({type:'response.output_text.delta',delta:'stream'})+'\r\n\r\n',
   'event: response.completed\r\ndata: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:13,output_tokens:6}}})+'\r\n\r\n'
  ];
  return {ok:true,status:200,body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(encoder.encode(chunk));controller.close();}})};
 },async()=>{
  const tokens=[];const result=await providers.generateStream({provider:'openai',system:'Rules',messages:[{role:'user',content:'Hi'}],onToken:token=>tokens.push(token)});
  assert.deepEqual(tokens,['OpenAI ','stream']);
  assert.deepEqual(result,{text:'OpenAI stream',inputTokens:13,outputTokens:6});
 }));
});

test('Gemini streaming adapter emits candidate text and usage metadata',async()=>{
 await withEnv({GOOGLE_GEMINI_API_KEY:'gemini-stream-key'},()=>withFetch(async(url,options)=>{
  assert.ok(url.includes('/models/gemini-3.8-flash:streamGenerateContent?alt=sse'));
  assert.equal(options.headers['x-goog-api-key'],'gemini-stream-key');
  const encoder=new TextEncoder();
  const chunks=[
   'data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Gemini '}]}}],usageMetadata:{promptTokenCount:17}})+'\n\n',
   'data: '+JSON.stringify({candidates:[{content:{parts:[{text:'stream'}]}}],usageMetadata:{promptTokenCount:17,candidatesTokenCount:8}})+'\n\n'
  ];
  return {ok:true,status:200,body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(encoder.encode(chunk));controller.close();}})};
 },async()=>{
  const tokens=[];const result=await providers.generateStream({provider:'gemini',system:'Rules',messages:[{role:'user',content:'Hi'}],onToken:token=>tokens.push(token)});
  assert.deepEqual(tokens,['Gemini ','stream']);
  assert.deepEqual(result,{text:'Gemini stream',inputTokens:17,outputTokens:8});
 }));
});


test('caller cancellation aborts an in-flight provider stream without misreporting a timeout',async()=>{
 await withEnv({ANTHROPIC_API_KEY:'anthropic-stream-key'},()=>withFetch((_url,{signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error);},{once:true});
 }),async()=>{
  const controller=new AbortController();
  const pending=providers.generateStream({provider:'anthropic',system:'Rules',messages:[{role:'user',content:'Hi'}],signal:controller.signal});
  setTimeout(()=>controller.abort(),5);
  await assert.rejects(()=>pending,/streaming client disconnected/i);
 }));
});


test('provider stream is cancelled when the downstream token consumer fails',async()=>{
 await withEnv({ANTHROPIC_API_KEY:'anthropic-stream-key'},()=>withFetch(async()=>{
  let cancelled=false;
  const encoder=new TextEncoder();
  const body=new ReadableStream({
   start(controller){controller.enqueue(encoder.encode('data: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:'partial'}})+'\n\n'));},
   cancel(){cancelled=true;}
  });
  return {ok:true,status:200,body};
 },async()=>{
  await assert.rejects(()=>providers.generateStream({
   provider:'anthropic',system:'Rules',messages:[{role:'user',content:'Hi'}],
   onToken:()=>{throw new Error('downstream disconnected');}
  }),/downstream disconnected/);
  assert.equal(cancelled,true);
 }));
});
