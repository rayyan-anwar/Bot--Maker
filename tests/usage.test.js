const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-usage-'));
process.env.BOTFORGE_DATA_FILE=path.join(tempDir,'db.json');
process.env.FREE_DAILY_MESSAGES='2';
const store=require('../server/store');
const usage=require('../server/usage');

test('daily quota reservations prevent concurrent over-allocation',()=>{
 store.load();
 assert.equal(usage.assertCanSend('user-1').remaining,1);
 assert.equal(usage.assertCanSend('user-1').remaining,0);
 assert.throws(()=>usage.assertCanSend('user-1'),error=>error.status===429);
 assert.equal(usage.usageSummary('user-1').pending,2);
});

test('failed requests can release a reservation for retry',()=>{
 usage.releaseReservation('user-1');
 assert.equal(usage.usageSummary('user-1').pending,1);
 assert.equal(usage.assertCanSend('user-1').remaining,0);
 usage.releaseReservation('user-1');
 usage.releaseReservation('user-1');
 assert.equal(usage.usageSummary('user-1').pending,0);
});

test('successful usage converts a reservation into a counted message',()=>{
 usage.assertCanSend('user-2');
 usage.recordUsage({userId:'user-2',botId:'bot-1',provider:'anthropic',model:'test-model',inputTokens:10,outputTokens:5});
 const summary=usage.usageSummary('user-2');
 assert.equal(summary.used,1);
 assert.equal(summary.pending,0);
 assert.equal(summary.remaining,1);
});

test.after(()=>fs.rmSync(tempDir,{recursive:true,force:true}));
