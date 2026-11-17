const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {signatureValid}=require('../server/billing');
test('Stripe webhook signature validates raw body and rejects tampering',()=>{
 const secret='whsec_test_secret',timestamp=Math.floor(Date.now()/1000),body=Buffer.from(JSON.stringify({id:'evt_test'}));
 const digest=crypto.createHmac('sha256',secret).update(String(timestamp)+'.').update(body).digest('hex');
 assert.equal(signatureValid(body,'t='+timestamp+',v1='+digest,secret),true);
 assert.equal(signatureValid(Buffer.from('tampered'),'t='+timestamp+',v1='+digest,secret),false);
 assert.equal(signatureValid(body,'t='+(timestamp-600)+',v1='+digest,secret),false);
 assert.equal(signatureValid(body,'t='+timestamp+',v1='+digest,''),false);
});

const {razorpaySignatureValid}=require('../server/billing');
test('Razorpay webhook signature validates raw body and rejects tampering',()=>{
 const secret='razorpay_test_webhook_secret',body=Buffer.from(JSON.stringify({event:'subscription.activated'}));
 const digest=crypto.createHmac('sha256',secret).update(body).digest('hex');
 assert.equal(razorpaySignatureValid(body,digest,secret),true);
 assert.equal(razorpaySignatureValid(Buffer.from('tampered'),digest,secret),false);
 assert.equal(razorpaySignatureValid(body,digest,''),false);
});

const {isRazorpaySubscriptionActive}=require('../server/billing');
test('Razorpay grants paid access only after subscription is active',()=>{
 assert.equal(isRazorpaySubscriptionActive('active'),true);
 assert.equal(isRazorpaySubscriptionActive('authenticated'),false);
 assert.equal(isRazorpaySubscriptionActive('created'),false);
 assert.equal(isRazorpaySubscriptionActive('pending'),false);
 assert.equal(isRazorpaySubscriptionActive('halted'),false);
 assert.equal(isRazorpaySubscriptionActive('cancelled'),false);
});
