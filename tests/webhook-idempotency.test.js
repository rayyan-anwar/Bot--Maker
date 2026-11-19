const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-webhooks-'));
process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
delete process.env.DATABASE_URL;
const store=require('../server/store');

test('webhook event claims are idempotent, provider-scoped, and retryable after release',async(t)=>{
 await store.initialize();
 t.after(async()=>{await store.close();fs.rmSync(dir,{recursive:true,force:true});});
 assert.equal(await store.claimWebhookEvent('stripe','evt_duplicate_test'),true);
 await assert.rejects(()=>store.claimWebhookEvent('stripe','evt_duplicate_test'),error=>error.status===409);
 assert.equal(await store.claimWebhookEvent('razorpay','evt_duplicate_test'),true);
 await store.releaseWebhookEvent('stripe','evt_duplicate_test');
 assert.equal(await store.claimWebhookEvent('stripe','evt_duplicate_test'),true);
 await store.completeWebhookEvent('stripe','evt_duplicate_test');
 assert.equal(await store.claimWebhookEvent('stripe','evt_duplicate_test'),false);
 await assert.rejects(()=>store.claimWebhookEvent('stripe',''),/Invalid webhook event identity/);
});
