const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('billing endpoints enforce authentication and fail closed when providers are not configured',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-billing-'));
 process.env.JWT_SECRET='test-only-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='billing-test@example.com';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 for(const key of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_PLUS','STRIPE_PRICE_PRO','STRIPE_SUCCESS_URL','STRIPE_CANCEL_URL','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','RAZORPAY_PLAN_PLUS','RAZORPAY_PLAN_PRO'])delete process.env[key];
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const unauth=await fetch(base+'/api/billing/plans');
 assert.equal(unauth.status,401);
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 await store.insertAsync('users',{id:uuidv4(),email:'billing-test@example.com',name:'Billing Test',passwordHash:await bcrypt.hash('a-secure-test-password-123',12),createdAt:new Date().toISOString()});
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'billing-test@example.com',password:'a-secure-test-password-123'})});
 assert.equal(login.status,200);
 const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 assert.ok(cookie.startsWith('session='));
 const plans=await fetch(base+'/api/billing/plans',{headers:{cookie}});
 assert.equal(plans.status,200);
 const planData=await plans.json();
 assert.equal(planData.providers.stripe,false);
 assert.equal(planData.providers.razorpay,false);
 const stripe=await fetch(base+'/api/billing/checkout',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({plan:'plus'})});
 assert.equal(stripe.status,503);
 const razorpay=await fetch(base+'/api/billing/razorpay/checkout',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({plan:'plus'})});
 assert.equal(razorpay.status,503);
 const webhookPayload=JSON.stringify({event:'subscription.activated'});
 const webhookBody=Buffer.from(webhookPayload);
 const webhookSecret='razorpay-route-test-webhook-secret';
 process.env.RAZORPAY_WEBHOOK_SECRET=webhookSecret;
 const signature=require('node:crypto').createHmac('sha256',webhookSecret).update(webhookBody).digest('hex');
 const missingEventId=await fetch(base+'/api/billing/razorpay/webhook',{method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':signature},body:webhookBody});
 assert.equal(missingEventId.status,400);
 const eventHeaders={'content-type':'application/json','x-razorpay-signature':signature,'x-razorpay-event-id':'evt_route_test_1'};
 const webhook=await fetch(base+'/api/billing/razorpay/webhook',{method:'POST',headers:eventHeaders,body:webhookBody});
 assert.equal(webhook.status,200);
 assert.deepEqual(await webhook.json(),{received:true});
 const duplicate=await fetch(base+'/api/billing/razorpay/webhook',{method:'POST',headers:eventHeaders,body:webhookBody});
 assert.equal(duplicate.status,200);
 assert.deepEqual(await duplicate.json(),{received:true,duplicate:true});

 const stripeClaim=store.applySubscriptionEvent(
  (await store.findManyAsync('users',{email:'billing-test@example.com'}))[0].id,
  'stripe','sub_stripe_race_1',{plan:'plus',stripeSubscriptionId:'sub_stripe_race_1'}
 );
 const razorpayClaim=store.applySubscriptionEvent(
  (await store.findManyAsync('users',{email:'billing-test@example.com'}))[0].id,
  'razorpay','sub_rzp_race_1',{plan:'pro',razorpaySubscriptionId:'sub_rzp_race_1'}
 );
 const [stripeResult,razorpayResult]=await Promise.all([stripeClaim,razorpayClaim]);
 assert.equal(Number(!!stripeResult)+Number(!!razorpayResult),1,'only one provider may claim an unlinked account');
 const provider=stripeResult?'stripe':'razorpay';
 const subscriptionId=stripeResult?'sub_stripe_race_1':'sub_rzp_race_1';
 const endedPatch=provider==='stripe'?{plan:'free',stripeSubscriptionId:null}:{plan:'free',razorpaySubscriptionId:null};
 const ended=await store.applySubscriptionEvent(
  (await store.findManyAsync('users',{email:'billing-test@example.com'}))[0].id,
  provider,subscriptionId,endedPatch,{requireOwnership:true,ended:true}
 );
 assert.ok(ended,'the current subscription can be ended');
 const stale=await store.applySubscriptionEvent(
  (await store.findManyAsync('users',{email:'billing-test@example.com'}))[0].id,
  provider,subscriptionId,{plan:'pro',[provider==='stripe'?'stripeSubscriptionId':'razorpaySubscriptionId']:subscriptionId}
 );
 assert.equal(stale,null,'a stale active event cannot resurrect an ended subscription');
 const replacementId=provider==='stripe'?'sub_stripe_replacement':'sub_rzp_replacement';
 const replacement=await store.applySubscriptionEvent(
  (await store.findManyAsync('users',{email:'billing-test@example.com'}))[0].id,
  provider,replacementId,{plan:'plus',[provider==='stripe'?'stripeSubscriptionId':'razorpaySubscriptionId']:replacementId}
 );
 assert.ok(replacement,'a distinct replacement subscription can be linked');
});


test('subscription webhooks cannot overwrite a different provider or newer subscription',()=>{
 const {canClaimSubscription,ownsSubscription}=require('../server/billing');
 const stripeUser={id:'user-1',stripeSubscriptionId:'sub_stripe_new'};
 const razorpayUser={id:'user-1',razorpaySubscriptionId:'sub_rzp_new'};
 assert.equal(canClaimSubscription(stripeUser,'stripe','sub_stripe_old'),false);
 assert.equal(canClaimSubscription(razorpayUser,'razorpay','sub_rzp_old'),false);
 assert.equal(canClaimSubscription(stripeUser,'razorpay','sub_rzp_old'),false);
 assert.equal(canClaimSubscription(razorpayUser,'stripe','sub_stripe_old'),false);
 assert.equal(ownsSubscription(stripeUser,'stripe','sub_stripe_old'),false);
 assert.equal(ownsSubscription(razorpayUser,'razorpay','sub_rzp_old'),false);
 assert.equal(ownsSubscription(stripeUser,'stripe','sub_stripe_new'),true);
 assert.equal(ownsSubscription(razorpayUser,'razorpay','sub_rzp_new'),true);
});

test('first subscription event may claim an unlinked account but deletion must match its subscription',()=>{
 const {canClaimSubscription,ownsSubscription}=require('../server/billing');
 const user={id:'user-1'};
 assert.equal(canClaimSubscription(user,'stripe','sub_stripe_1'),true);
 assert.equal(canClaimSubscription(user,'razorpay','sub_rzp_1'),true);
 assert.equal(ownsSubscription(user,'stripe','sub_stripe_1'),false);
 assert.equal(ownsSubscription(user,'razorpay','sub_rzp_1'),false);
});
