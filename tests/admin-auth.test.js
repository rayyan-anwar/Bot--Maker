const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('single-administrator startup requires a valid owner email',()=>{
 const previousEnv=process.env.NODE_ENV,previousFlag=process.env.BOTFORGE_SINGLE_ADMIN,previousEmail=process.env.BOTFORGE_ADMIN_EMAIL,previousJwt=process.env.JWT_SECRET;
 process.env.NODE_ENV='test';
 process.env.BOTFORGE_SINGLE_ADMIN='true';
 process.env.JWT_SECRET='single-admin-config-test-secret-with-at-least-thirty-two-characters';
 const {validateSingleAdminConfig}=require('../server/index');
 try{
  process.env.BOTFORGE_ADMIN_EMAIL='';
  assert.throws(()=>validateSingleAdminConfig(),/BOTFORGE_ADMIN_EMAIL must be set/);
  process.env.BOTFORGE_ADMIN_EMAIL='not-an-email';
  assert.throws(()=>validateSingleAdminConfig(),/BOTFORGE_ADMIN_EMAIL must be set/);
  process.env.BOTFORGE_ADMIN_EMAIL='owner @example.com';
  assert.throws(()=>validateSingleAdminConfig(),/BOTFORGE_ADMIN_EMAIL must be set/);
  process.env.BOTFORGE_ADMIN_EMAIL='a'.repeat(250)+'@example.com';
  assert.throws(()=>validateSingleAdminConfig(),/BOTFORGE_ADMIN_EMAIL must be set/);
  process.env.BOTFORGE_ADMIN_EMAIL='owner@example.com';
  assert.equal(validateSingleAdminConfig(),true);
  process.env.BOTFORGE_ADMIN_EMAIL='owner+tag@example.co.in';
  assert.equal(validateSingleAdminConfig(),true);
  process.env.NODE_ENV='production';
  process.env.BOTFORGE_ADMIN_EMAIL='owner@example.com';
  process.env.JWT_SECRET='';
  assert.throws(()=>validateSingleAdminConfig(),/JWT_SECRET must contain at least 32 characters/);
  process.env.JWT_SECRET='short-secret';
  assert.throws(()=>validateSingleAdminConfig(),/JWT_SECRET must contain at least 32 characters/);
  process.env.JWT_SECRET='production-test-secret-with-more-than-thirty-two-characters';
  assert.equal(validateSingleAdminConfig(),true);
 }finally{if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;if(previousFlag===undefined)delete process.env.BOTFORGE_SINGLE_ADMIN;else process.env.BOTFORGE_SINGLE_ADMIN=previousFlag;if(previousEmail===undefined)delete process.env.BOTFORGE_ADMIN_EMAIL;else process.env.BOTFORGE_ADMIN_EMAIL=previousEmail;if(previousJwt===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwt;delete require.cache[require.resolve('../server/index')];}
});

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
 const securityHeaders=await fetch(base+'/healthz');
 const csp=securityHeaders.headers.get('content-security-policy')||'';
 assert.match(csp,/default-src 'self'/);
 assert.match(csp,/object-src 'none'/);
 assert.match(csp,/frame-ancestors 'none'/);
 assert.match(csp,/connect-src 'self'/);
 async function post(route,body){const origin=process.env.NODE_ENV==='production'?base.replace(/^http:/,'https:'):base;return fetch(base+route,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});}
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
 assert.match(cookie,/HttpOnly/i);
 assert.match(cookie,/SameSite=Strict/i);
 const me=await fetch(base+'/api/auth/me',{headers:{cookie}});
 assert.equal(me.status,200);
 assert.equal((await me.json()).user.role,'user');
 const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie}});
 assert.equal(logout.status,200);
 assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie}})).status,401);
 const customerLogin=await post('/api/auth/login',{email:'customer@example.com',password:'strong-customer-password-123'});
 assert.equal(customerLogin.status,200);
 const customerCookie=customerLogin.headers.get('set-cookie');
 const adminApi=await fetch(base+'/api/admin/plans',{headers:{cookie:customerCookie}});
 assert.equal((await fetch(base+'/api/admin/engineer/diagnose-ci',{method:'POST',headers:{cookie:customerCookie,'content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/admin/engineer/propose-fix',{method:'POST',headers:{cookie:customerCookie,'content-type':'application/json'},body:JSON.stringify({path:'server/auth.js',task:'Review session handling'})})).status,403);
 assert.equal((await fetch(base+'/api/admin/engineer/create-draft-pr',{method:'POST',headers:{cookie:customerCookie,'content-type':'application/json'},body:JSON.stringify({path:'server/auth.js',task:'Review session handling',proposedContent:'module.exports={};',baseSha:'a'.repeat(40),confirm:true})})).status,403);
 assert.equal((await fetch(base+'/api/admin/engineer/security-scan',{headers:{cookie:customerCookie}})).status,403);
 assert.equal(adminApi.status,403);
 assert.equal((await fetch(base+'/admin.html',{headers:{cookie:customerCookie}})).status,403);
 for(let i=0;i<2;i++)assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'wrong-password'})).status,401);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'wrong-password'})).status,423);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'strong-customer-password-123'})).status,423);

 const crypto=require('node:crypto'),store=require('../server/store');
 const resetToken='a'.repeat(64),resetHash=crypto.createHash('sha256').update(resetToken).digest('hex');
 const customer=(await store.findManyAsync('users',{email:'customer@example.com'}))[0];
 const malformedExpiryToken='e'.repeat(64),malformedExpiryHash=crypto.createHash('sha256').update(malformedExpiryToken).digest('hex');
 await store.updateByIdAsync('users',customer.id,{passwordResetTokenHash:malformedExpiryHash,passwordResetExpiresAt:'not-a-date'});
 assert.equal((await post('/api/auth/password/reset',{token:malformedExpiryToken,password:'malformed-expiry-password-123'})).status,400);
 await store.updateByIdAsync('users',customer.id,{passwordResetTokenHash:resetHash,passwordResetExpiresAt:new Date(Date.now()+60000).toISOString()});
 const reset=await post('/api/auth/password/reset',{token:resetToken,password:'new-customer-password-456'});
 assert.equal(reset.status,200);
 assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie}})).status,401);
 assert.equal((await post('/api/auth/password/reset',{token:resetToken,password:'another-password-789'})).status,400);
 assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'new-customer-password-456'})).status,200);

 // Two concurrent requests cannot consume the same reset token twice.
 const replayToken='c'.repeat(64),replayHash=crypto.createHash('sha256').update(replayToken).digest('hex');
 await store.updateByIdAsync('users',customer.id,{passwordResetTokenHash:replayHash,passwordResetExpiresAt:new Date(Date.now()+60000).toISOString()});
 const replayResults=await Promise.all([
  post('/api/auth/password/reset',{token:replayToken,password:'parallel-reset-password-111'}),
  post('/api/auth/password/reset',{token:replayToken,password:'parallel-reset-password-222'})
 ]);
 assert.deepEqual(replayResults.map(response=>response.status).sort(),[200,400]);

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
 const legacyCustomerResetToken='d'.repeat(64);
 await store.updateByIdAsync('users',customer.id,{passwordResetTokenHash:crypto.createHash('sha256').update(legacyCustomerResetToken).digest('hex'),passwordResetExpiresAt:new Date(Date.now()+60000).toISOString()});

 // Production cookie-authenticated mutation requests must carry a same-host Origin.
 const previousNodeEnv=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 try{
  assert.equal((await fetch(base+'/api/auth/mode')).status,200);
  assert.deepEqual(await (await fetch(base+'/api/auth/mode')).json(),{singleAdmin:true});
  assert.equal((await post('/api/auth/signup',{name:'Attacker',email:'new-user@example.com',password:'strong-password-123'})).status,403);
  assert.equal((await post('/api/auth/login',{email:'customer@example.com',password:'new-customer-password-456'})).status,401);
  assert.equal((await fetch(base+'/api/auth/oauth/google')).status,404);
  assert.equal((await post('/api/auth/password/forgot',{email:'owner@example.com'})).status,202);
  assert.equal((await post('/api/auth/password/reset',{token:legacyCustomerResetToken,password:'legacy-token-must-not-work-123'})).status,400);
  assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie:customerCookie}})).status,401);
  const ownerLogin=await post('/api/auth/login',{email:'owner@example.com',password:'strong-admin-password-123'});
  assert.equal(ownerLogin.status,200);
  const ownerCookie=ownerLogin.headers.get('set-cookie');
  assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie:ownerCookie}})).status,403);
  assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie:ownerCookie,origin:base}})).status,403);
  assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie:ownerCookie}})).status,200);
  assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie:customerCookie}})).status,403);
  assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie:customerCookie,origin:base.replace(/^http:/,'https:')}})).status,200);
 }finally{process.env.NODE_ENV=previousNodeEnv;}

 const adminLogin=await post('/api/auth/login',{email:'owner@example.com',password:'strong-admin-password-123'});
 assert.equal(adminLogin.status,200);
 assert.equal((await adminLogin.json()).user.role,'admin');
 const adminCookie=adminLogin.headers.get('set-cookie');
 const controlUrl=base+'/api/admin/engineer/control',adminHeaders={cookie:adminCookie,'content-type':'application/json'};
 assert.equal((await fetch(controlUrl,{headers:{cookie:adminCookie}})).status,200);
 assert.equal((await fetch(controlUrl,{method:'PUT',headers:adminHeaders,body:JSON.stringify({enabled:false})})).status,200);
 assert.equal((await fetch(base+'/api/admin/engineer/diagnose-ci',{method:'POST',headers:adminHeaders,body:'{}'})).status,423);
 assert.equal((await fetch(controlUrl,{method:'PUT',headers:adminHeaders,body:JSON.stringify({enabled:true})})).status,200);
 assert.equal((await fetch(base+'/api/admin/engineer/audit',{headers:{cookie:adminCookie}})).status,200);
 assert.equal((await fetch(base+'/api/admin/engineer/diagnose-ci',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:'{}'})).status,503);
 assert.equal((await fetch(base+'/api/admin/engineer/propose-fix',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({path:'server/auth.js',task:'Review session handling'})})).status,503);
 assert.equal((await fetch(base+'/api/admin/engineer/create-draft-pr',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({path:'server/auth.js',task:'Review session handling',proposedContent:'module.exports={};',baseSha:'a'.repeat(40),confirm:true})})).status,503);
 // The shared AI Engineer write limiter allows five requests per minute across both routes.
 for(let i=0;i<3;i++)assert.equal((await fetch(base+'/api/admin/engineer/propose-fix',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({path:'server/auth.js',task:'Review session handling'})})).status,503);
 assert.equal((await fetch(base+'/api/admin/engineer/create-draft-pr',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({path:'server/auth.js',task:'Review session handling',proposedContent:'module.exports={};',baseSha:'a'.repeat(40),confirm:true})})).status,429);
 const scanResponse=await fetch(base+'/api/admin/engineer/security-scan',{headers:{cookie:adminCookie}});
 assert.equal(scanResponse.status,200);
 const scanResult=await scanResponse.json();
 assert.equal(scanResult.ok,true);
 assert.ok(scanResult.filesScanned>0);
 // The endpoint is deliberately rate-limited to protect CPU on repeated scans.
 for(let i=0;i<4;i++) assert.equal((await fetch(base+'/api/admin/engineer/security-scan',{headers:{cookie:adminCookie}})).status,200);
 const limitedScan=await fetch(base+'/api/admin/engineer/security-scan',{headers:{cookie:adminCookie}});
 assert.equal(limitedScan.status,429);
 assert.equal((await fetch(base+'/api/admin/plans',{headers:{cookie:adminCookie}})).status,200);
 assert.equal((await fetch(base+'/admin.html',{headers:{cookie:adminCookie}})).status,200);
 await store.updateByIdAsync('users',owner.id,{sessionVersion:Number(owner.sessionVersion||0)+1});
 assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie:adminCookie}})).status,401);
 for(let i=0;i<2;i++)assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'incorrect-admin-password'})).status,401);
 assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'incorrect-admin-password'})).status,423);
 assert.equal((await post('/api/auth/login',{email:'owner@example.com',password:'strong-admin-password-123'})).status,423);
});
