'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {detectImageType,MAX_IMAGE_BYTES}=require('../server/vision');
const providers=require('../server/providers');

test('visual upload accepts only JPEG, PNG and WebP signatures',()=>{
 assert.equal(detectImageType(Buffer.from([0xff,0xd8,0xff,0x00])),'image/jpeg');
 assert.equal(detectImageType(Buffer.from([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(detectImageType(Buffer.from('RIFFxxxxWEBP','ascii')),'image/webp');
 assert.equal(detectImageType(Buffer.from('<svg></svg>')),null);
 assert.equal(detectImageType(Buffer.from('not an image')),null);
 assert.equal(MAX_IMAGE_BYTES,4*1024*1024);
});

test('OpenAI vision adapter sends a bounded low-detail image and Fortisni safety instructions',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=global.fetch;
 process.env.OPENAI_API_KEY='vision-test-key';
 let captured;
 global.fetch=async(url,options)=>{
  captured={url,options,body:JSON.parse(options.body)};
  return {ok:true,json:async()=>({id:'resp_test',output_text:'A blue cup is on a wooden table.',usage:{input_tokens:120,output_tokens:12}})};
 };
 try{
  const result=await providers.generateVision({model:'gpt-5.5',prompt:'What is visible?',imageBase64:Buffer.from('fake-image').toString('base64'),mimeType:'image/jpeg'});
  assert.equal(result.text,'A blue cup is on a wooden table.');
  assert.equal(result.inputTokens,120);
  assert.equal(result.providerRequestId,'resp_test');
  assert.equal(captured.url,'https://api.openai.com/v1/responses');
  assert.equal(captured.body.input[0].content[1].detail,'low');
  assert.match(captured.body.instructions,/do not identify people/i);
  assert.match(captured.body.input[0].content[1].image_url,/^data:image\/jpeg;base64,/);
  assert.equal(captured.options.headers.authorization,'Bearer vision-test-key');
 }finally{
  global.fetch=previousFetch;
  if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
 }
});

test('OpenAI vision adapter rejects unsupported media and malformed prompts before network access',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=global.fetch;
 process.env.OPENAI_API_KEY='vision-test-key';
 global.fetch=async()=>{throw new Error('network must not be called');};
 try{
  await assert.rejects(()=>providers.generateVision({prompt:'Describe this',imageBase64:'a',mimeType:'image/svg+xml'}),/Unsupported vision image type/);
  await assert.rejects(()=>providers.generateVision({prompt:'',imageBase64:'a',mimeType:'image/jpeg'}),/prompt must contain/);
 }finally{
  global.fetch=previousFetch;
  if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
 }
});
