const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('administrator-only bot and document listing routes require the configured admin account',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-listing-'));
 process.env.JWT_SECRET='test-only-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='listing-test@example.com';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 await store.insertAsync('users',{id:uuidv4(),email:'listing-test@example.com',name:'Admin',passwordHash:await bcrypt.hash('a-secure-admin-password-123',12),createdAt:new Date().toISOString()});
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'listing-test@example.com',password:'a-secure-admin-password-123'})});
 assert.equal(login.status,200);
 const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 const created=await fetch(base+'/api/bots',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'Test bot',instructions:'Answer clearly.',isPublic:true})});
 assert.equal(created.status,201);
 const bot=(await created.json()).bot;
 const mine=await fetch(base+'/api/bots/mine',{headers:{cookie}});
 assert.equal(mine.status,200);
 assert.equal((await mine.json()).bots[0].id,bot.id);
 const shared=await fetch(base+'/api/bots/public',{headers:{cookie}});
 assert.equal(shared.status,200);
 assert.equal((await shared.json()).bots[0].id,bot.id);
 const history=await fetch(base+'/api/chat/'+bot.id+'/messages',{headers:{cookie}});
 assert.equal(history.status,200);
 assert.deepEqual((await history.json()).messages,[]);
 const docs=await fetch(base+'/api/documents/'+bot.id,{headers:{cookie}});
 assert.equal(docs.status,200);
 assert.deepEqual((await docs.json()).documents,[]);

 // A second account may view a public bot's safe metadata, but never its
 // private instructions or owner-only mutation endpoints.
 await store.insertAsync('users',{id:uuidv4(),email:'visitor@example.com',name:'Visitor',passwordHash:await bcrypt.hash('visitor-password-123',10),createdAt:new Date().toISOString()});
 const visitorLogin=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'visitor@example.com',password:'visitor-password-123'})});
 assert.equal(visitorLogin.status,200);
 const visitorCookie=(visitorLogin.headers.get('set-cookie')||'').split(';')[0];
 const publicDetail=await fetch(base+'/api/bots/'+bot.id,{headers:{cookie:visitorCookie}});
 assert.equal(publicDetail.status,200);
 const publicPayload=(await publicDetail.json()).bot;
 assert.equal(publicPayload.name,'Test bot');
 assert.equal(Object.hasOwn(publicPayload,'instructions'),false);
 const visitorEdit=await fetch(base+'/api/bots/'+bot.id,{method:'PUT',headers:{cookie:visitorCookie,'content-type':'application/json'},body:JSON.stringify({name:'Hijacked'})});
 assert.equal(visitorEdit.status,403);
 const visitorDelete=await fetch(base+'/api/bots/'+bot.id,{method:'DELETE',headers:{cookie:visitorCookie}});
 assert.equal(visitorDelete.status,403);
 const privateBot=await fetch(base+'/api/bots',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'Private bot',instructions:'Never expose these instructions.',isPublic:false})});
 assert.equal(privateBot.status,201);
 const privateId=(await privateBot.json()).bot.id;
 const privateDetail=await fetch(base+'/api/bots/'+privateId,{headers:{cookie:visitorCookie}});
 assert.equal(privateDetail.status,403);
 const publicList=await fetch(base+'/api/bots/public',{headers:{cookie:visitorCookie}});
 assert.equal(publicList.status,200);
 assert.deepEqual((await publicList.json()).bots.map(item=>item.id),[bot.id]);
});


test('bot edits create immutable versions and owner can restore an earlier version',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-versions-'));
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='version-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='versions@example.test';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 await store.insertAsync('users',{id:uuidv4(),email:'versions@example.test',name:'Versions',passwordHash:await bcrypt.hash('version-password-123',10),createdAt:new Date().toISOString()});
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'versions@example.test',password:'version-password-123'})});
 assert.equal(login.status,200);const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 const created=await fetch(base+'/api/bots',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'First name',instructions:'First instructions'})});
 assert.equal(created.status,201);const bot=(await created.json()).bot;
 const edited=await fetch(base+'/api/bots/'+bot.id,{method:'PUT',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'Second name'})});
 assert.equal(edited.status,200);assert.equal((await edited.json()).bot.version,2);
 const history=await fetch(base+'/api/bots/'+bot.id+'/versions',{headers:{cookie}});
 assert.equal(history.status,200);assert.deepEqual((await history.json()).versions.map(v=>v.version),[2,1]);
 const restored=await fetch(base+'/api/bots/'+bot.id+'/versions/1/restore',{method:'POST',headers:{cookie}});
 assert.equal(restored.status,200);const result=(await restored.json());
 assert.equal(result.bot.name,'First name');assert.equal(result.bot.version,3);assert.equal(result.restoredFrom,1);
 const latest=await fetch(base+'/api/bots/'+bot.id+'/versions',{headers:{cookie}});
 assert.deepEqual((await latest.json()).versions.map(v=>v.version),[3,2,1]);
});

test('deleting a bot also removes its version history',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-version-delete-'));
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const store=require('../server/store');
 const {v4:uuidv4}=require('uuid');
 const botId=uuidv4(),ownerId=uuidv4(),now=new Date().toISOString();
 try{
  await store.insertAsync('bots',{id:botId,ownerId,name:'Delete me',instructions:'Test',createdAt:now});
  await store.insertAsync('botVersions',{id:uuidv4(),botId,ownerId,version:1,snapshot:{name:'Delete me'},createdAt:now});
  assert.equal((await store.findManyAsync('botVersions',{botId})).length,1);
  assert.equal(await store.deleteBotAndData(botId),true);
  assert.deepEqual(await store.findManyAsync('botVersions',{botId}),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
