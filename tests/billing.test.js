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
