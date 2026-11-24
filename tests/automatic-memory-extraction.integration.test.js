'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('automatic memory extraction filters sensitive candidates before persistence',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-auto-memory-safety-'));
 process.env.NODE_ENV='test';
 process.env.BOTFORGE_ENABLE_MOCK_PROVIDER='true';
 process.env.BOTFORGE_CHAT_RATE_LIMIT='10';
 process.env.JWT_SECRET='automatic-memory-safety-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='memory-safety@example.test';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const providers=require('../server/providers');
 const originalGenerate=providers.generate;
 providers.generate=async input=>{
  if(input.system.includes('Extract only stable facts')){
   return {text:JSON.stringify([
    'User has diabetes and takes insulin.',
    'User is Muslim.',
    'User supports a political party.',
    'User password is hunter2.',
    'User prefers concise technical explanations.'
   ]),inputTokens:0,outputTokens:0};
  }
  return {text:'The mock assistant response is ready.',inputTokens:0,outputTokens:0};
 };
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{
  providers.generate=originalGenerate;
  await shutdown();
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 const user={id:uuidv4(),email:'memory-safety@example.test',name:'Memory Safety',passwordHash:await bcrypt.hash('memory-safety-password-123',10),createdAt:new Date().toISOString()};
 await store.insertAsync('users',user);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:'memory-safety-password-123'})});
 assert.equal(login.status,200);
 const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 const created=await fetch(base+'/api/bots',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'Memory safety bot',instructions:'Answer briefly.',provider:'mock'})});
 assert.equal(created.status,201);
 const bot=(await created.json()).bot;
 const enabled=await fetch(base+'/api/chat/'+bot.id+'/memory/automatic',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({enabled:true})});
 assert.equal(enabled.status,200);
 const chat=await fetch(base+'/api/chat/'+bot.id+'/messages',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({content:'Please remember how I prefer technical answers.'})});
 assert.equal(chat.status,200);
 const rows=await store.findManyAsync('memory',{botId:bot.id,userId:user.id});
 const automatic=rows.filter(row=>row.kind==='automatic');
 assert.deepEqual(automatic.map(row=>row.content),['User prefers concise technical explanations.']);
});
