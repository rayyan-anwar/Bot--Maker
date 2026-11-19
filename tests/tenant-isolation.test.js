const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('private bot resources are isolated between two authenticated accounts',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-tenant-isolation-'));
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='tenant-isolation-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='owner-a@example.test';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 for(const [email,name] of [['owner-a@example.test','Owner A'],['owner-b@example.test','Owner B']]){
  await store.insertAsync('users',{id:uuidv4(),email,name,passwordHash:await bcrypt.hash('tenant-test-password-123',10),createdAt:new Date().toISOString()});
 }
 async function login(email){
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'tenant-test-password-123'})});
  assert.equal(response.status,200);
  return (response.headers.get('set-cookie')||'').split(';')[0];
 }
 const cookieA=await login('owner-a@example.test'),cookieB=await login('owner-b@example.test');
 const created=await fetch(base+'/api/bots',{method:'POST',headers:{cookie:cookieA,'content-type':'application/json'},body:JSON.stringify({name:'Private research bot',instructions:'Confidential owner-only instructions.'})});
 assert.equal(created.status,201);
 const bot=(await created.json()).bot;
 const forbidden=async(response)=>assert.equal(response.status,403);
 await forbidden(await fetch(base+'/api/bots/'+bot.id,{headers:{cookie:cookieB}}));
 await forbidden(await fetch(base+'/api/bots/'+bot.id+'/versions',{headers:{cookie:cookieB}}));
 await forbidden(await fetch(base+'/api/bots/'+bot.id,{method:'PUT',headers:{cookie:cookieB,'content-type':'application/json'},body:JSON.stringify({name:'Hijacked'})}));
 await forbidden(await fetch(base+'/api/bots/'+bot.id+'/versions/1/restore',{method:'POST',headers:{cookie:cookieB}}));
 await forbidden(await fetch(base+'/api/documents/'+bot.id,{headers:{cookie:cookieB}}));
 await forbidden(await fetch(base+'/api/chat/'+bot.id+'/messages',{headers:{cookie:cookieB}}));
 await forbidden(await fetch(base+'/api/chat/'+bot.id+'/memory',{headers:{cookie:cookieB}}));
 await forbidden(await fetch(base+'/api/chat/'+bot.id+'/messages',{method:'POST',headers:{cookie:cookieB,'content-type':'application/json'},body:JSON.stringify({content:'Try to use another account bot'})}));
 await forbidden(await fetch(base+'/api/bots/'+bot.id,{method:'DELETE',headers:{cookie:cookieB}}));
 const ownerRead=await fetch(base+'/api/bots/'+bot.id,{headers:{cookie:cookieA}});
 assert.equal(ownerRead.status,200);
 assert.equal((await ownerRead.json()).bot.instructions,'Confidential owner-only instructions.');
 const stillExists=await fetch(base+'/api/bots/'+bot.id,{headers:{cookie:cookieA}});
 assert.equal(stillExists.status,200);
});

test('public bot serialization does not disclose private instructions',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-public-prompt-'));
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='public-prompt-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='prompt-owner@example.test';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 for(const email of ['prompt-owner@example.test','prompt-viewer@example.test'])await store.insertAsync('users',{id:uuidv4(),email,name:email,passwordHash:await bcrypt.hash('prompt-test-password-123',10),createdAt:new Date().toISOString()});
 async function login(email){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'prompt-test-password-123'})});assert.equal(r.status,200);return (r.headers.get('set-cookie')||'').split(';')[0];}
 const owner=await login('prompt-owner@example.test'),viewer=await login('prompt-viewer@example.test');
 const created=await fetch(base+'/api/bots',{method:'POST',headers:{cookie:owner,'content-type':'application/json'},body:JSON.stringify({name:'Public helper',instructions:'NEVER DISCLOSE THIS PRIVATE SYSTEM PROMPT.',isPublic:true})});
 assert.equal(created.status,201);const bot=(await created.json()).bot;
 const publicRead=await fetch(base+'/api/bots/'+bot.id,{headers:{cookie:viewer}});
 assert.equal(publicRead.status,200);
 const payload=await publicRead.json();
 assert.equal(payload.isOwner,false);
 assert.equal(Object.hasOwn(payload.bot,'instructions'),false);
 assert.equal(JSON.stringify(payload).includes('NEVER DISCLOSE THIS PRIVATE SYSTEM PROMPT.'),false);
});
