const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('public signup works, admin email is reserved, and three wrong passwords lock a user account',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-public-auth-'));
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='public-auth-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='owner@example.com';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 async function post(route,body){return fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
 const recoveryRequest=await post('/api/auth/password/forgot',{email:'customer@example.com'});
 assert.equal(recoveryRequest.status,202);
  const oauthUnavailable=await fetch(base+'/api/auth/oauth/google');
 assert.equal(oauthUnavailable.status,503);
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
 assert.equal((await fetch(base+'/api/admin/engineer/diagnose-ci',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'})).status,403);
 assert.equal(adminApi.status,403);
 assert.equal((await fetch(base+'/admin.html',{headers:{cookie}})).status,403);
 for(let i=0;i<2;i++)assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'wrong-password'})).status,401);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'wrong-password'})).status,423);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'strong-customer-password-123'})).status,423);

 const crypto=require('node:crypto'),store=require('../server/store');
 const resetToken='a'.repeat(64),resetHash=crypto.createHash('sha256').update(resetToken).digest('hex');
 const customer=(await store.findManyAsync('users',{email:'customer@example.com'}))[0];
 await store.updateByIdAsync('users',customer.id,{passwordResetTokenHash:resetHash,passwordResetExpiresAt:new Date(Date.now()+60000).toISOString()});
 const reset=await post('/api/auth/password/reset',{token:resetToken,password:'new-customer-password-456'});
 assert.equal(reset.status,200);
 assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie}})).status,401);
 assert.equal((await post('/api/auth/password/reset',{token:resetToken,password:'another-password-789'})).status,400);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'new-customer-password-456'})).status,200);

 // The reserved administrator is provisioned out-of-band, can access admin APIs,
 // and is subject to the same three-failure lockout policy.
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid');
 await store.insertAsync('users',{id:uuidv4(),email:'owner@example.com',name:'Owner',passwordHash:await bcrypt.hash('strong-admin-password-123',12),failedLoginAttempts:0,createdAt:new Date().toISOString()});
 const adminForgot=await post('/api/auth/password/forgot',{email:'owner@example.com'});
 assert.equal(adminForgot.status,202);
 const owner=(await store.findManyAsync('users',{email:'owner@example.com'}))[0];
 assert.equal(owner.passwordResetTokenHash,undefined);
 const adminResetToken='b'.repeat(64);
 await store.updateByIdAsync('users',owner.id,{passwordResetTokenHash:crypto.createHash('sha256').update(adminResetToken).digest('hex'),passwordResetExpiresAt:new Date(Date.now()+60000).toISOString()});
 assert.equal((await post('/api/auth/password/reset',{token:adminResetToken,password:'attacker-chosen-password-123'})).status,400);
 const adminLogin=await post('/api/auth/login',{email:'owner@example.com',password:'strong-admin-password-123'});
 assert.equal(adminLogin.status,200);
 assert.equal((await adminLogin.json()).user.role,'admin');
 const adminCookie=adminLogin.headers.get('set-cookie');
 assert.equal((await fetch(base+'/api/admin/engineer/diagnose-ci',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:'{}'})).status,503);
 assert.equal((await fetch(base+'/api/admin/plans',{headers:{cookie:adminCookie}})).status,200);
 assert.equal((await fetch(base+'/admin.html',{headers:{cookie:adminCookie}})).status,200);
 for(let i=0;i<2;i++)assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'incorrect-admin-password'})).status,401);
 assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'incorrect-admin-password'})).status,423);
 assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'strong-admin-password-123'})).status,423);
});
