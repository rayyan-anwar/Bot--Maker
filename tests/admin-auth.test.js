const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('public registration is disabled and three wrong passwords lock the configured administrator until server reset',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-admin-auth-'));
 process.env.JWT_SECRET='admin-auth-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='owner@example.com';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 assert.equal((await fetch(base+'/api/auth/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'strong-admin-password-123',name:'Owner'})})).status,403);
 await store.insertAsync('users',{id:uuidv4(),email:'owner@example.com',name:'Owner',passwordHash:await bcrypt.hash('strong-admin-password-123',12),failedLoginAttempts:0,createdAt:new Date().toISOString()});
 for(let i=0;i<2;i++){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'wrong-password'})});assert.equal(response.status,401);}
 const third=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'wrong-password'})});
 assert.equal(third.status,423);
 const locked=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'strong-admin-password-123'})});
 assert.equal(locked.status,423);
 const me=await fetch(base+'/api/auth/me');
 assert.equal(me.status,401);
});
