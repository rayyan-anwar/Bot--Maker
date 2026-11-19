const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-webhook-lease-'));
process.env.NODE_ENV='test';
process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
delete process.env.DATABASE_URL;
const store=require('../server/store');

test('webhook claims distinguish completed, in-flight, released and expired events',async t=>{
 t.after(async()=>{await store.close();fs.rmSync(dir,{recursive:true,force:true});});
 assert.equal(await store.claimWebhookEvent('stripe','evt-completed'),true);
 await assert.rejects(()=>store.claimWebhookEvent('stripe','evt-completed'),error=>error.status===409);
 await store.completeWebhookEvent('stripe','evt-completed');
 assert.equal(await store.claimWebhookEvent('stripe','evt-completed'),false);
 assert.equal(await store.claimWebhookEvent('razorpay','evt-retry'),true);
 await store.releaseWebhookEvent('razorpay','evt-retry');
 assert.equal(await store.claimWebhookEvent('razorpay','evt-retry'),true);
 const record=store.load().webhookEvents.find(event=>event.eventId==='evt-retry');
 record.processingUntil=new Date(Date.now()-1000).toISOString();
 store.persist();
 assert.equal(await store.claimWebhookEvent('razorpay','evt-retry'),true);
 await store.completeWebhookEvent('razorpay','evt-retry');
 assert.equal(await store.claimWebhookEvent('razorpay','evt-retry'),false);
});
