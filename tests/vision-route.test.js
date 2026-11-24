'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('Fortisni vision endpoint requires authentication and explicit user initiation',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-vision-route-'));
 const previous={NODE_ENV:process.env.NODE_ENV,JWT_SECRET:process.env.JWT_SECRET,BOTFORGE_DATA_FILE:process.env.BOTFORGE_DATA_FILE,BOTFORGE_ADMIN_EMAIL:process.env.BOTFORGE_ADMIN_EMAIL,OPENAI_API_KEY:process.env.OPENAI_API_KEY};
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='fortisni-vision-route-secret-at-least-thirty-two-characters';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 process.env.BOTFORGE_ADMIN_EMAIL='vision-route@example.test';
 delete process.env.OPENAI_API_KEY;
 let shutdown;
 try{
  const app=require('../server/index');
  shutdown=app.shutdown;
  const server=await app.start(0,'127.0.0.1');
  const base='http://127.0.0.1:'+server.address().port;
  const image=()=>new Blob([Buffer.from([137,80,78,71,13,10,26,10])],{type:'image/png'});
  const anonymousForm=new FormData();
  anonymousForm.append('userInitiated','true');
  anonymousForm.append('image',image(),'sample.png');
  const anonymous=await fetch(base+'/api/vision/analyze',{method:'POST',body:anonymousForm});
  assert.equal(anonymous.status,401);

  const bcrypt=require('bcryptjs');
  const {v4:uuidv4}=require('uuid');
  const store=require('../server/store');
  const user={id:uuidv4(),email:'vision-route@example.test',name:'Vision route test',passwordHash:await bcrypt.hash('vision-route-password-123',10),createdAt:new Date().toISOString()};
  await store.insertAsync('users',user);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:'vision-route-password-123'})});
  assert.equal(login.status,200);
  const cookie=(login.headers.get('set-cookie')||'').split(';')[0];

  const deniedForm=new FormData();
  deniedForm.append('userInitiated','false');
  deniedForm.append('image',image(),'sample.png');
  const denied=await fetch(base+'/api/vision/analyze',{method:'POST',headers:{cookie},body:deniedForm});
  assert.equal(denied.status,400);
  assert.match((await denied.json()).error,/explicitly/);
 }finally{
  if(shutdown)await shutdown();
  fs.rmSync(dir,{recursive:true,force:true});
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
