'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-memory-edit-'));
process.env.NODE_ENV='test';
process.env.JWT_SECRET='personal-memory-edit-test-secret-at-least-thirty-two-characters';
process.env.BOTFORGE_ADMIN_EMAIL='memory-owner@example.test';
process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
delete process.env.DATABASE_URL;
const {start,shutdown}=require('../server/index');
const store=require('../server/store');
const bcrypt=require('bcryptjs');
const {v4:uuidv4}=require('uuid');
let server,base,ownerCookie,otherCookie,ownerId,otherId;
async function createUser(email){
 const user={id:uuidv4(),email,name:email,passwordHash:await bcrypt.hash('memory-test-password-123',10),createdAt:new Date().toISOString()};
 await store.insertAsync('users',user);
 return user;
}
async function login(email){
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'memory-test-password-123'})});
 assert.equal(response.status,200);
 return (response.headers.get('set-cookie')||'').split(';')[0];
}
test.before(async()=>{
 server=await start(0,'127.0.0.1');base='http://127.0.0.1:'+server.address().port;
 const owner=await createUser('memory-owner@example.test'),other=await createUser('memory-other@example.test');
 ownerId=owner.id;otherId=other.id;
 ownerCookie=await login(owner.email);otherCookie=await login(other.email);
});
test.after(async()=>{if(server)await shutdown();fs.rmSync(dir,{recursive:true,force:true});});

test('owner can edit personal memory and the API returns the updated note',async()=>{
 const note={id:uuidv4(),userId:ownerId,botId:null,kind:'profile',content:'Prefers short answers',createdAt:new Date().toISOString()};
 await store.insertAsync('memory',note);
 const response=await fetch(base+'/api/chat/memory/me/'+note.id,{method:'PATCH',headers:{cookie:ownerCookie,'content-type':'application/json'},body:JSON.stringify({content:'  Prefers detailed, structured answers  '})});
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.memory.content,'Prefers detailed, structured answers');
 assert.ok(body.memory.updatedAt);
});

test('personal memory edits do not reveal notes owned by another account',async()=>{
 const note={id:uuidv4(),userId:ownerId,botId:null,kind:'profile',content:'Private preference',createdAt:new Date().toISOString()};
 await store.insertAsync('memory',note);
 const response=await fetch(base+'/api/chat/memory/me/'+note.id,{method:'PATCH',headers:{cookie:otherCookie,'content-type':'application/json'},body:JSON.stringify({content:'Changed by another user'})});
 assert.equal(response.status,404);
 assert.equal((await store.findByIdAsync('memory',note.id)).content,'Private preference');
});

test('personal memory edits reject invalid, duplicate and non-profile records',async()=>{
 const note={id:uuidv4(),userId:ownerId,botId:null,kind:'profile',content:'Original preference',createdAt:new Date().toISOString()};
 const duplicate={id:uuidv4(),userId:ownerId,botId:null,kind:'profile',content:'Existing preference',createdAt:new Date().toISOString()};
 const automatic={id:uuidv4(),userId:ownerId,botId:'bot-1',kind:'automatic',content:'Automatic note',createdAt:new Date().toISOString()};
 await store.insertAsync('memory',note);await store.insertAsync('memory',duplicate);await store.insertAsync('memory',automatic);
 const request=(id,content)=>fetch(base+'/api/chat/memory/me/'+id,{method:'PATCH',headers:{cookie:ownerCookie,'content-type':'application/json'},body:JSON.stringify({content})});
 assert.equal((await request(note.id,'   ')).status,400);
 assert.equal((await request(note.id,'x'.repeat(501))).status,400);
 assert.equal((await request(note.id,'Existing preference')).status,409);
 assert.equal((await request(automatic.id,'Edited automatic note')).status,404);
});

test('unknown personal memory IDs return not found',async()=>{
 const response=await fetch(base+'/api/chat/memory/me/'+uuidv4(),{method:'PATCH',headers:{cookie:ownerCookie,'content-type':'application/json'},body:JSON.stringify({content:'New value'})});
 assert.equal(response.status,404);
});
