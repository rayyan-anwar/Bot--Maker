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
  await t.test('bot deletion removes version snapshots in PostgreSQL',async()=>{
   const botId=crypto.randomUUID(),versionId=crypto.randomUUID(),now=new Date().toISOString();
   await store.insertAsync('bots',{id:botId,ownerId:userId,name:'Version cleanup test',instructions:'Test',createdAt:now});
   await store.insertAsync('botVersions',{id:versionId,botId,ownerId:userId,version:1,snapshot:{name:'Version cleanup test'},createdAt:now});
   assert.equal((await store.findManyAsync('botVersions',{botId})).length,1);
   assert.equal(await store.deleteBotAndData(botId),true);
   assert.deepEqual(await store.findManyAsync('botVersions',{botId}),[]);
  });
  await t.test('password reset tokens are consumed only once under concurrency',async()=>{
   const tokenHash=crypto.createHash('sha256').update('one-time-reset-token').digest('hex');
   await store.updateByIdAsync('users',userId,{passwordResetTokenHash:tokenHash,passwordResetExpiresAt:new Date(Date.now()+60000).toISOString(),sessionVersion:0});
   const results=await Promise.all([
    store.consumePasswordResetToken(tokenHash,{passwordResetTokenHash:null,passwordResetExpiresAt:null,sessionVersion:1}),
    store.consumePasswordResetToken(tokenHash,{passwordResetTokenHash:null,passwordResetExpiresAt:null,sessionVersion:1})
   ]);
   assert.equal(results.filter(Boolean).length,1);
   assert.equal(results.filter(x=>x===null).length,1);
  });
  await t.test('AI Engineer approval claim is atomic and completed replay is idempotent',async()=>{
   const approvalId=crypto.randomUUID();
   await store.insertAsync('aiEngineerApprovals',{id:approvalId,actorId:'admin-one',repository:'owner/repo',filePath:'server/auth.js',baseSha:'a'.repeat(40),contentHash:'b'.repeat(64),taskHash:'c'.repeat(64),status:'pending',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),attempts:0});
   const claims=await Promise.all(Array.from({length:8},()=>store.claimEngineerApproval(approvalId,'admin-one')));
   assert.equal(claims.filter(x=>x.state==='claimed').length,1);
   assert.equal(claims.filter(x=>x.state==='in_progress').length,7);
   await store.updateEngineerApproval(approvalId,'admin-one',{status:'created',leaseUntil:null,branch:'botforge-ai-fix/'+approvalId,pullRequestNumber:84,url:'https://github.com/owner/repo/pull/84'});
   const replay=await store.claimEngineerApproval(approvalId,'admin-one');
   assert.equal(replay.state,'created');
   assert.equal(replay.approval.pullRequestNumber,84);
   await store.deleteByIdAsync('aiEngineerApprovals',approvalId);
  });
  await t.test('concurrent knowledge base inserts obey per-bot document and character limits',async()=>{
   const botId=crypto.randomUUID(),docs=Array.from({length:8},(_,i)=>({id:crypto.randomUUID(),botId,contentHash:crypto.createHash('sha256').update('knowledge-'+i).digest('hex'),characterCount:5,chunks:[{id:crypto.randomUUID(),text:'doc-'+i}],filename:'doc-'+i+'.txt'}));
   try{
    const results=await Promise.all(docs.map(doc=>store.insertDocumentWithinCapacity(doc,{maxDocuments:3,maxCharacters:100})));
    assert.equal(results.filter(result=>result.inserted).length,3);
    assert.equal(results.filter(result=>result.reason==='document_limit').length,5);
   }finally{for(const doc of docs)await store.deleteByIdAsync('documents',doc.id);}
  });
  await t.test('concurrent duplicate knowledge uploads are accepted only once',async()=>{
   const botId=crypto.randomUUID(),contentHash=crypto.createHash('sha256').update('same knowledge').digest('hex'),docs=Array.from({length:8},(_,i)=>({id:crypto.randomUUID(),botId,contentHash,characterCount:14,chunks:[{id:crypto.randomUUID(),text:'same knowledge'}],filename:'duplicate-'+i+'.txt'}));
   try{
    const results=await Promise.all(docs.map(doc=>store.insertDocumentWithinCapacity(doc,{maxDocuments:10,maxCharacters:1000})));
    assert.equal(results.filter(result=>result.inserted).length,1);
    assert.equal(results.filter(result=>result.reason==='duplicate').length,7);
   }finally{for(const doc of docs)await store.deleteByIdAsync('documents',doc.id);}
  });

  await t.test('concurrent Agent Lab task inserts enforce per-user active capacity and idempotency',async()=>{
   const taskRecords=Array.from({length:8},(_,i)=>({id:crypto.randomUUID(),userId,kind:'agent-task',taskType:'agent.plan.execute',payload:{index:i},status:'queued',attempt:0,maxAttempts:3,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),availableAt:new Date().toISOString(),idempotencyKey:null}));
   try{
    const limited=await Promise.all(taskRecords.map(record=>store.insertAgentTaskWithinCapacity(record,3)));
    assert.equal(limited.filter(result=>result.created).length,3);
    assert.equal(limited.filter(result=>result.reason==='capacity').length,5);
    const duplicateKey='pg-agent-idempotency-'+crypto.randomUUID();
    const duplicates=Array.from({length:8},(_,i)=>store.insertAgentTaskWithinCapacity({...taskRecords[i],id:crypto.randomUUID(),idempotencyKey:duplicateKey},10));
    const duplicateResults=await Promise.all(duplicates);
    assert.equal(duplicateResults.filter(result=>result.created).length,1);
    assert.equal(duplicateResults.filter(result=>!result.created&&result.record).length,7);
   }finally{
    for(const record of taskRecords)await store.deleteByIdAsync('aiEngineerRuns',record.id);
    const remaining=await store.findManyAsync('aiEngineerRuns',{userId});
    for(const record of remaining.filter(row=>row.kind==='agent-task'))await store.deleteByIdAsync('aiEngineerRuns',record.id);
   }
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
