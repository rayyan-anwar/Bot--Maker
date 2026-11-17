const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');

const databaseUrl=process.env.BOTFORGE_TEST_DATABASE_URL;
test('PostgreSQL integration: shared rate limits, atomic login lockout and quota reservations', {skip:!databaseUrl?'BOTFORGE_TEST_DATABASE_URL is not configured':false}, async t=>{
 process.env.DATABASE_URL=databaseUrl;
 process.env.PGSSL='disable';
 const store=require('../server/store');
 const {PostgresRateLimitStore}=require('../server/rate-limit-store');
 await Promise.all(Array.from({length:12},()=>store.initialize()));
 const userId=crypto.randomUUID();
 const email='pg-integration-'+userId+'@example.test';
 const limiter=new PostgresRateLimitStore('integration-'+userId,store.query);
 const reservationIds=[];
 try{
  await t.test('normalized schema supports OAuth-only accounts and account-wide memory',async()=>{
   await store.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[userId,email,'OAuth integration user',null]);
   const memoryId=crypto.randomUUID();
   await store.query('INSERT INTO memory_notes(id,bot_id,user_id,content) VALUES($1,NULL,$2,$3)',[memoryId,userId,'Account-wide profile note']);
   const result=await store.query('SELECT bot_id,content FROM memory_notes WHERE id=$1',[memoryId]);
   assert.equal(result.rowCount,1);
   assert.equal(result.rows[0].bot_id,null);
   assert.equal(result.rows[0].content,'Account-wide profile note');
   await store.query('DELETE FROM users WHERE id=$1',[userId]);
  });
  await t.test('shared rate limit increments are atomic across concurrent requests',async()=>{
   await limiter.init({windowMs:60000});
   const hits=await Promise.all(Array.from({length:40},()=>limiter.increment('client')));
   assert.equal(hits.length,40);
   assert.deepEqual(hits.map(x=>x.totalHits).sort((a,b)=>a-b),Array.from({length:40},(_,i)=>i+1));
   assert.ok(hits.every(x=>x.resetTime instanceof Date));
  });
  await t.test('failed-login lockout counter is atomic under concurrent requests',async()=>{
   await store.insertAsync('users',{id:userId,email,name:'PG integration',passwordHash:'unused',failedLoginAttempts:0});
   const outcomes=await Promise.all(Array.from({length:8},()=>store.recordFailedLoginAttempt(userId,3)));
   assert.equal(outcomes.filter(x=>x.locked).length,6);
   const user=await store.findByIdAsync('users',userId);
   assert.equal(user.failedLoginAttempts,3);
   assert.ok(user.lockedAt);
  });
  await t.test('concurrent quota reservations never exceed the daily limit',async()=>{
   const day=new Date().toISOString().slice(0,10);
   const results=await Promise.all(Array.from({length:8},async()=>{
    try{const result=await store.reserveUsageSlot(userId,3,day);reservationIds.push(result.reservationId);return result;}
    catch(error){return error;}
   }));
   assert.equal(results.filter(x=>x&&x.reservationId).length,3);
   assert.equal(results.filter(x=>x&&x.status===429).length,5);
   const summary=await store.usageStats(userId,day);
   assert.equal(Number(summary.pending),3);
  });
 }finally{
  for(const id of reservationIds)await store.releaseUsageSlot(id);
  await limiter.resetKey('client');
  await store.deleteByIdAsync('users',userId);
  await store.close();
 }
});
