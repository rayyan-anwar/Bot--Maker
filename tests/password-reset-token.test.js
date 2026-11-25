const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');

test('password reset token can be consumed only once and expired tokens cannot be consumed',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-password-reset-'));
 process.env.NODE_ENV='test';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const store=require('../server/store');
 t.after(async()=>{await store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const userId=crypto.randomUUID();
 const tokenHash=crypto.createHash('sha256').update('one-time-reset-token').digest('hex');
 const expiredHash=crypto.createHash('sha256').update('expired-reset-token').digest('hex');
 await store.insertAsync('users',{
  id:userId,email:'reset-owner@example.test',name:'Reset Owner',passwordHash:null,
  sessionVersion:4,passwordResetTokenHash:tokenHash,
  passwordResetExpiresAt:new Date(Date.now()+60_000).toISOString()
 });
 await store.insertAsync('users',{
  id:crypto.randomUUID(),email:'expired-owner@example.test',name:'Expired Owner',passwordHash:null,
  sessionVersion:2,passwordResetTokenHash:expiredHash,
  passwordResetExpiresAt:new Date(Date.now()-60_000).toISOString()
 });
 const attempts=await Promise.all([
  store.consumePasswordResetToken(tokenHash,{passwordHash:'hash-from-first-request',passwordResetTokenHash:null,passwordResetExpiresAt:null,sessionVersion:5}),
  store.consumePasswordResetToken(tokenHash,{passwordHash:'hash-from-second-request',passwordResetTokenHash:null,passwordResetExpiresAt:null,sessionVersion:5})
 ]);
 assert.equal(attempts.filter(Boolean).length,1,'only one concurrent reset request may consume a token');
 const user=await store.findByIdAsync('users',userId);
 assert.ok(['hash-from-first-request','hash-from-second-request'].includes(user.passwordHash));
 assert.equal(user.passwordResetTokenHash,null);
 assert.equal(user.sessionVersion,5,'successful password reset must revoke existing sessions');
 assert.equal(await store.consumePasswordResetToken(tokenHash,{passwordHash:'replayed-token'}),null,'a consumed token must not be reusable');
 assert.equal(await store.consumePasswordResetToken(expiredHash,{passwordHash:'expired-token'}),null,'an expired token must not be accepted');
});

test('password reset page removes the one-time token from browser URL history immediately',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/reset-password.html'),'utf8');
 const capture=html.indexOf("token=new URLSearchParams(location.search).get('token')");
 const cleanup=html.indexOf("history.replaceState(null,document.title,location.pathname)",capture);
 const submit=html.indexOf("send('reset',{token,password:",cleanup);
 assert.ok(capture>=0,'page must read the token from the reset link');
 assert.ok(cleanup>capture,'page must replace the URL after capturing the token');
 assert.ok(submit>cleanup,'captured token must still be submitted after URL cleanup');
 assert.match(html,/history\.replaceState\(null,document\.title,location\.pathname\)/);
});

test('password reset page prevents the one-time token from being sent in a Referer header',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/reset-password.html'),'utf8');
 assert.match(html,/<meta\\s+name="referrer"\\s+content="no-referrer">/i);
});
