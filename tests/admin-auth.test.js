const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('public signup works, admin email is reserved, and three wrong passwords lock a user account',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-public-auth-'));
 process.env.JWT_SECRET='public-auth-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='owner@example.com';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 async function post(route,body){return fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
 const reserved=await post('/api/auth/signup',{name:'Owner',email:'owner@example.com',password:'strong-admin-password-123'});
 assert.equal(reserved.status,409);
 const signup=await post('/api/auth/signup',{name:'Customer',email:'customer@example.com',password:'strong-customer-password-123'});
 assert.equal(signup.status,201);
 const cookie=signup.headers.get('set-cookie');
 assert.ok(cookie&&cookie.includes('session='));
 const me=await fetch(base+'/api/auth/me',{headers:{cookie}});
 assert.equal(me.status,200);
 assert.equal((await me.json()).user.role,'user');
 const adminApi=await fetch(base+'/api/admin/plans',{headers:{cookie}});
 assert.equal(adminApi.status,403);
 for(let i=0;i<2;i++)assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'wrong-password'})).status,401);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'wrong-password'})).status,423);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'strong-customer-password-123'})).status,423);

 // The reserved administrator is provisioned out-of-band, can access admin APIs,
 // and is subject to the same three-failure lockout policy.
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 await store.insertAsync('users',{id:uuidv4(),email:'owner@example.com',name:'Owner',passwordHash:await bcrypt.hash('strong-admin-password-123',12),failedLoginAttempts:0,createdAt:new Date().toISOString()});
 const adminLogin=await post('/api/auth/login',{email:'owner@example.com',password:'strong-admin-password-123'});
 assert.equal(adminLogin.status,200);
 assert.equal((await adminLogin.json()).user.role,'admin');
 const adminCookie=adminLogin.headers.get('set-cookie');
 assert.equal((await fetch(base+'/api/admin/plans',{headers:{cookie:adminCookie}})).status,200);
 for(let i=0;i<2;i++)assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'incorrect-admin-password'})).status,401);
 assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'incorrect-admin-password'})).status,423);
 assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'strong-admin-password-123'})).status,423);
});
