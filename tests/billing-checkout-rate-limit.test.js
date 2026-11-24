const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('billing checkout creation is limited per authenticated account',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-checkout-limit-'));
 const keys=['NODE_ENV','DATABASE_URL','JWT_SECRET','BOTFORGE_ADMIN_EMAIL','BOTFORGE_DATA_FILE','STRIPE_SECRET_KEY','STRIPE_PRICE_PLUS','STRIPE_SUCCESS_URL','STRIPE_CANCEL_URL'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const originalFetch=global.fetch;
 process.env.NODE_ENV='test';
 delete process.env.DATABASE_URL;
 process.env.JWT_SECRET='checkout-limit-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='checkout-limit@example.test';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 process.env.STRIPE_SECRET_KEY='stripe-test-secret';
 process.env.STRIPE_PRICE_PLUS='price_test_plus';
 process.env.STRIPE_SUCCESS_URL='https://app.example.test/success';
 process.env.STRIPE_CANCEL_URL='https://app.example.test/cancel';
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{
  global.fetch=originalFetch;
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  await shutdown();
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 await store.insertAsync('users',{id:uuidv4(),email:'checkout-limit@example.test',name:'Checkout Limit',passwordHash:await bcrypt.hash('checkout-limit-password-123',10),createdAt:new Date().toISOString()});
 const login=await originalFetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'checkout-limit@example.test',password:'checkout-limit-password-123'})});
 assert.equal(login.status,200);
 const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 global.fetch=async(url,options)=>{
  if(String(url)==='https://api.stripe.com/v1/checkout/sessions')return {ok:true,status:200,json:async()=>({url:'https://checkout.example.test/session'})};
  return originalFetch(url,options);
 };
 const first=await global.fetch(base+'/api/billing/checkout',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({plan:'plus'})});
 assert.equal(first.status,200);
 assert.equal((await first.json()).provider,'stripe');
 for(let i=0;i<4;i++){
  const blocked=await global.fetch(base+'/api/billing/checkout',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({plan:'plus'})});
  assert.equal(blocked.status,409,'a live checkout reservation blocks duplicate provider sessions');
 }
 const limited=await global.fetch(base+'/api/billing/checkout',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({plan:'plus'})});
 assert.equal(limited.status,429);
 assert.match((await limited.json()).error,/Too many checkout attempts/);
});
