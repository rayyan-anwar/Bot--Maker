'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const testDir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-vision-tests-'));
process.env.NODE_ENV='test';
process.env.JWT_SECRET=process.env.JWT_SECRET||'fortisni-vision-test-secret-at-least-thirty-two-characters';
process.env.BOTFORGE_DATA_FILE=path.join(testDir,'db.json');
test.after(()=>fs.rmSync(testDir,{recursive:true,force:true}));
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


test('vision endpoint requires login and an explicit user-initiated upload',async()=>{
 const previousAdmin=process.env.BOTFORGE_ADMIN_EMAIL,previousKey=process.env.OPENAI_API_KEY;
 process.env.BOTFORGE_ADMIN_EMAIL='vision-admin@example.test';
 delete process.env.OPENAI_API_KEY;
 delete require.cache[require.resolve('../server/auth')];
 delete require.cache[require.resolve('../server/index')];
 const {start,shutdown}=require('../server/index');
 try{
  const server=await start(0,'127.0.0.1');
  const base='http://127.0.0.1:'+server.address().port;
  const unauthForm=new FormData();
  unauthForm.append('userInitiated','true');
  unauthForm.append('image',new Blob([Buffer.from([137,80,78,71,13,10,26,10])],{type:'image/png'}),'photo.png');
  const unauth=await fetch(base+'/api/vision/analyze',{method:'POST',body:unauthForm});
  assert.equal(unauth.status,401);

  const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
  const user={id:uuidv4(),email:'vision-admin@example.test',name:'Vision test',passwordHash:await bcrypt.hash('vision-password-123',10),createdAt:new Date().toISOString()};
  await store.insertAsync('users',user);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:'vision-password-123'})});
  assert.equal(login.status,200);
  const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
  const form=new FormData();
  form.append('userInitiated','false');
  form.append('image',new Blob([Buffer.from([137,80,78,71,13,10,26,10])],{type:'image/png'}),'photo.png');
  const denied=await fetch(base+'/api/vision/analyze',{method:'POST',headers:{cookie},body:form});
  assert.equal(denied.status,400);
  assert.match((await denied.json()).error,/explicitly/);
 }finally{
  try{await shutdown();}finally{
   if(previousAdmin===undefined)delete process.env.BOTFORGE_ADMIN_EMAIL;else process.env.BOTFORGE_ADMIN_EMAIL=previousAdmin;
   if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
  }
 }
});
