const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-usage-'));process.env.BOTFORGE_DATA_FILE=path.join(tempDir,'db.json');process.env.FREE_DAILY_MESSAGES='2';
const store=require('../server/store');const usage=require('../server/usage');
const user1='11111111-1111-4111-8111-111111111111',user2='22222222-2222-4222-8222-222222222222',user3='44444444-4444-4444-8444-444444444444';
test('concurrent quota reservations enforce the daily limit',async()=>{await store.initialize();const results=await Promise.all([usage.assertCanSend(user1),usage.assertCanSend(user1)]);assert.equal(results[0].remaining+results[1].remaining,1);await assert.rejects(()=>usage.assertCanSend(user1),e=>e.status===429);assert.equal((await usage.usageSummary(user1)).pending,2);});
test('a failed request releases only its own reservation',async()=>{const a=await usage.assertCanSend(user2),b=await usage.assertCanSend(user2);await usage.releaseReservation(a.reservationId);assert.equal((await usage.usageSummary(user2)).pending,1);const retry=await usage.assertCanSend(user2);await assert.rejects(()=>usage.assertCanSend(user2),e=>e.status===429);await usage.releaseReservation(b.reservationId);await usage.releaseReservation(retry.reservationId);assert.equal((await usage.usageSummary(user2)).pending,0);});
test('successful usage atomically replaces its reservation',async()=>{const slot=await usage.assertCanSend(user3);await usage.recordUsage({userId:user3,botId:'33333333-3333-4333-8333-333333333333',provider:'anthropic',model:'test-model',inputTokens:10,outputTokens:5,reservationId:slot.reservationId});const summary=await usage.usageSummary(user3);assert.equal(summary.used,1);assert.equal(summary.pending,0);assert.equal(summary.remaining,1);});
test('async store API preserves JSON development adapter behavior',async()=>{const record={id:require('node:crypto').randomUUID(),email:'async@example.com'};await store.insertAsync('users',record);assert.deepEqual(await store.findByIdAsync('users',record.id),record);assert.equal((await store.allAsync('users')).some(x=>x.id===record.id),true);assert.equal(await store.deleteByIdAsync('users',record.id),true);assert.equal(await store.findByIdAsync('users',record.id),null);});
test('async store rejects malformed UUIDs safely',async()=>{assert.equal(await store.findByIdAsync('bots','not-a-uuid'),null);assert.equal(await store.updateByIdAsync('bots','not-a-uuid',{name:'bad'}),null);assert.equal(await store.deleteByIdAsync('bots','not-a-uuid'),false);});

test('chat turn persistence stores both messages and usage as one unit',async()=>{
 const user='55555555-5555-4555-8555-555555555555';
 const bot='66666666-6666-4666-8666-666666666666';
 const slot=await usage.assertCanSend(user);
 const userMessage={id:require('node:crypto').randomUUID(),userId:user,botId:bot,role:'user',content:'hello',createdAt:new Date().toISOString()};
 const assistantMessage={id:require('node:crypto').randomUUID(),userId:user,botId:bot,role:'assistant',content:'hi',createdAt:new Date().toISOString()};
 const usageRecord={id:require('node:crypto').randomUUID(),userId:user,botId:bot,provider:'anthropic',model:'test',inputTokens:1,outputTokens:1,day:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString()};
 await store.commitChatTurn({userMessage,assistantMessage,usageRecord},slot.reservationId);
 assert.equal((await store.allAsync('messages')).filter(m=>m.userId===user).length,2);
 assert.equal((await usage.usageSummary(user)).used,1);
 assert.equal((await usage.usageSummary(user)).pending,0);
});
\ntest.after(async()=>{await store.close();fs.rmSync(tempDir,{recursive:true,force:true});});
