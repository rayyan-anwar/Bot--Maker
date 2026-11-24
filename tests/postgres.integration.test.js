const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');

const databaseUrl=process.env.BOTFORGE_TEST_DATABASE_URL;
test('PostgreSQL integration: shared rate limits, atomic login lockout and quota reservations', {skip:!databaseUrl?'BOTFORGE_TEST_DATABASE_URL is not configured':false}, async t=>{
 process.env.DATABASE_URL=databaseUrl;
 process.env.PGSSL='disable';
 const store=require('../server/store');
 const agentTaskService=require('../server/agent-task-service');
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
  await t.test('billing checkout reservations are atomic across providers and can be released',async()=>{
   const checkoutUserId=crypto.randomUUID(),checkoutEmail='pg-checkout-'+checkoutUserId+'@example.test';
   try{
    await store.insertAsync('users',{id:checkoutUserId,email:checkoutEmail,name:'Checkout reservation test'});
    const attempts=await Promise.all([
     store.reserveBillingCheckout(checkoutUserId,'stripe','plus',crypto.randomUUID()),
     store.reserveBillingCheckout(checkoutUserId,'razorpay','pro',crypto.randomUUID())
    ]);
    assert.equal(attempts.filter(Boolean).length,1,'only one concurrent checkout reservation may win');
    const winner=attempts.find(Boolean).billingCheckoutReservation;
    assert.ok(winner&&winner.id);
    assert.equal(await store.reserveBillingCheckout(checkoutUserId,'stripe','pro',crypto.randomUUID()),null,'an unexpired reservation blocks another checkout');
    assert.equal(await store.releaseBillingCheckout(checkoutUserId,winner.id),true);
    assert.equal(await store.releaseBillingCheckout(checkoutUserId,winner.id),false,'release is scoped to the reservation owner');
    const replacement=await store.reserveBillingCheckout(checkoutUserId,'stripe','pro',crypto.randomUUID());
    assert.ok(replacement,'a new checkout can reserve after release');
    assert.equal(await store.releaseBillingCheckout(checkoutUserId,replacement.billingCheckoutReservation.id),true);
   }finally{await store.deleteByIdAsync('users',checkoutUserId);}
  });
  await t.test('subscription claims are atomic across providers and ended events cannot be resurrected',async()=>{
   const claims=await Promise.all([
    store.applySubscriptionEvent(userId,'stripe','sub_pg_stripe_race',{plan:'plus',stripeSubscriptionId:'sub_pg_stripe_race'}),
    store.applySubscriptionEvent(userId,'razorpay','sub_pg_razorpay_race',{plan:'pro',razorpaySubscriptionId:'sub_pg_razorpay_race'})
   ]);
   assert.equal(claims.filter(Boolean).length,1);
   const provider=claims[0]?'stripe':'razorpay';
   const subscriptionId=provider==='stripe'?'sub_pg_stripe_race':'sub_pg_razorpay_race';
   const idField=provider==='stripe'?'stripeSubscriptionId':'razorpaySubscriptionId';
   const ended=await store.applySubscriptionEvent(userId,provider,subscriptionId,{plan:'free',[idField]:null},{ended:true});
   assert.ok(ended);
   assert.equal(await store.applySubscriptionEvent(userId,provider,subscriptionId,{plan:'pro',[idField]:subscriptionId}),null);
   const replacementId=provider==='stripe'?'sub_pg_stripe_replacement':'sub_pg_razorpay_replacement';
   assert.ok(await store.applySubscriptionEvent(userId,provider,replacementId,{plan:'plus',[idField]:replacementId}));
   const outOfOrderUserId=crypto.randomUUID();
   try{
    await store.insertAsync('users',{id:outOfOrderUserId,email:'pg-out-of-order-'+outOfOrderUserId+'@example.test',name:'Out of order webhook test'});
    assert.ok(await store.applySubscriptionEvent(outOfOrderUserId,provider,'sub_pg_cancel_first',{plan:'free',[idField]:null},{ended:true}));
    assert.equal(await store.applySubscriptionEvent(outOfOrderUserId,provider,'sub_pg_cancel_first',{plan:'plus',[idField]:'sub_pg_cancel_first'}),null);
   }finally{await store.deleteByIdAsync('users',outOfOrderUserId);}
  });
  await t.test('recoverable Stripe states retain ownership until activation or terminal cancellation',async()=>{
   const recoverableUserId=crypto.randomUUID(),subscriptionId='sub_pg_recoverable';
   try{
    await store.insertAsync('users',{id:recoverableUserId,email:'pg-recoverable-'+recoverableUserId+'@example.test',name:'Recoverable Stripe state'});
    assert.ok(await store.applySubscriptionEvent(recoverableUserId,'stripe',subscriptionId,{plan:'free',stripeSubscriptionId:subscriptionId}));
    const activated=await store.applySubscriptionEvent(recoverableUserId,'stripe',subscriptionId,{plan:'plus',stripeSubscriptionId:subscriptionId});
    assert.equal(activated.plan,'plus');
    const cancelled=await store.applySubscriptionEvent(recoverableUserId,'stripe',subscriptionId,{plan:'free',stripeSubscriptionId:null},{ended:true});
    assert.ok(cancelled);
    assert.equal(await store.applySubscriptionEvent(recoverableUserId,'stripe',subscriptionId,{plan:'plus',stripeSubscriptionId:subscriptionId}),null);
   }finally{await store.deleteByIdAsync('users',recoverableUserId);}
  });
  await t.test('bot deletion removes version snapshots in PostgreSQL',async()=>{
   const botId=crypto.randomUUID(),versionId=crypto.randomUUID(),now=new Date().toISOString();
   await store.insertAsync('bots',{id:botId,ownerId:userId,name:'Version cleanup test',instructions:'Test',createdAt:now});
   await store.insertAsync('botVersions',{id:versionId,botId,ownerId:userId,version:1,snapshot:{name:'Version cleanup test'},createdAt:now});
   assert.equal((await store.findManyAsync('botVersions',{botId})).length,1);
   assert.equal(await store.deleteBotAndData(botId),true);
   assert.deepEqual(await store.findManyAsync('botVersions',{botId}),[]);
  });
  await t.test('versioned bot creation and concurrent updates are atomic in PostgreSQL',async()=>{
   const botId=crypto.randomUUID(),versionId=crypto.randomUUID(),now=new Date().toISOString();
   const bot={id:botId,ownerId:userId,name:'Atomic bot',instructions:'Initial instructions',provider:'anthropic',isPublic:false,version:1,createdAt:now,updatedAt:now};
   const initial={id:versionId,botId,ownerId:userId,version:1,snapshot:{name:'Atomic bot'},createdAt:now};
   try{
    await store.createBotWithVersion(bot,initial);
    assert.equal((await store.findByIdAsync('bots',botId)).version,1);
    await assert.rejects(()=>store.updateBotVersioned({botId,ownerId:userId,expectedVersion:1,patch:{name:'Must roll back',version:2,updatedAt:new Date().toISOString()},versionRecord:{id:versionId,botId,ownerId:userId,version:2,snapshot:{name:'Must roll back'},createdAt:new Date().toISOString()}}));
    assert.equal((await store.findByIdAsync('bots',botId)).version,1);
    assert.deepEqual((await store.findManyAsync('botVersions',{botId,ownerId:userId})).map(row=>row.version),[1]);
    const update=(name)=>store.updateBotVersioned({botId,ownerId:userId,expectedVersion:1,patch:{name,version:2,updatedAt:new Date().toISOString()},versionRecord:{id:crypto.randomUUID(),botId,ownerId:userId,version:2,snapshot:{name},createdAt:new Date().toISOString()}});
    const outcomes=await Promise.all([update('Concurrent A'),update('Concurrent B')]);
    assert.equal(outcomes.filter(row=>row.state==='updated').length,1);
    assert.equal(outcomes.filter(row=>row.state==='conflict').length,1);
    assert.equal((await store.findByIdAsync('bots',botId)).version,2);
    assert.deepEqual((await store.findManyAsync('botVersions',{botId,ownerId:userId})).map(row=>row.version).sort((a,b)=>a-b),[1,2]);
   }finally{await store.deleteBotAndData(botId);}
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

  await t.test('concurrent PostgreSQL workers claim one task once and expired leases recover',async()=>{
   const taskId=crypto.randomUUID(),now=new Date();
   const record={id:taskId,userId,kind:'agent-task',taskType:'agent.plan.execute',payload:{planId:'pg-recovery-test'},status:'queued',attempt:0,maxAttempts:3,createdAt:now.toISOString(),updatedAt:now.toISOString(),availableAt:new Date(now.getTime()-1000).toISOString(),leaseOwner:null,leaseExpiresAt:null,idempotencyKey:null};
   try{
    await store.insertAsync('aiEngineerRuns',record);
    const claims=await Promise.all(Array.from({length:12},(_,i)=>agentTaskService.claimTask('pg-worker-'+i,new Date(),1000)));
    const winners=claims.filter(Boolean);
    assert.equal(winners.length,1);
    assert.equal(winners[0].id,taskId);
    assert.equal(winners[0].attempt,1);
    const expiredAt=new Date(Date.parse(winners[0].leaseExpiresAt)+1);
    const recovered=await agentTaskService.recoverExpiredTasks(expiredAt);
    assert.equal(recovered.length,1);
    assert.equal(recovered[0].id,taskId);
    assert.equal(recovered[0].status,'queued');
    assert.equal(recovered[0].leaseOwner,null);
   }finally{await store.deleteByIdAsync('aiEngineerRuns',taskId);}
  });
  await t.test('concurrent PostgreSQL schedulers claim a due workflow once and fence stale owners',async()=>{
   const workflowId=crypto.randomUUID(),slot=new Date(Date.now()-60000).toISOString();
   const workflow={id:workflowId,userId,kind:'automation-workflow',name:'Atomic scheduler test',steps:[{id:'step-1',type:'text.analyze',arguments:{}}],trigger:{type:'schedule',intervalMinutes:15},enabled:true,nextRunAt:slot,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   try{
    await store.insertAsync('aiEngineerRuns',workflow);
    const claims=await Promise.all(Array.from({length:8},()=>store.claimDueAutomationWorkflows(new Date(),10,60000)));
    const winners=claims.flat();
    assert.equal(winners.length,1);
    assert.equal(winners[0].scheduleClaimSlot,slot);
    assert.ok(winners[0].scheduleClaimToken);
    assert.equal(await store.finishAutomationScheduleClaim(workflowId,slot,'stale-claim-token',true),null);
    const finished=await store.finishAutomationScheduleClaim(workflowId,slot,winners[0].scheduleClaimToken,true);
    assert.ok(finished);
    assert.equal(Date.parse(finished.nextRunAt),Date.parse(slot)+15*60000);
    assert.equal(finished.scheduleClaimToken,null);
   }finally{await store.deleteByIdAsync('aiEngineerRuns',workflowId);}
  });
  await t.test('Fortisni vision context is consumed once across concurrent PostgreSQL chat requests',async()=>{
   const contextId=crypto.randomUUID(),now=Date.now();
   const context={id:contextId,userId,kind:'fortisni-vision-context',botId:null,contextKey:userId,summary:'A user-submitted image description.',createdAt:now,expiresAt:now+600000,used:false};
   try{
    await store.insertAsync('aiEngineerRuns',context);
    const results=await Promise.all(Array.from({length:12},()=>store.consumeFortisniVisionContext(userId)));
    assert.equal(results.filter(Boolean).length,1);
    assert.equal(results.filter(row=>row&&row.id===contextId).length,1);
    const stored=await store.findByIdAsync('aiEngineerRuns',contextId);
    assert.equal(stored.used,true);
    assert.equal(stored.summary,context.summary);
   }finally{await store.deleteByIdAsync('aiEngineerRuns',contextId);}
  });
  await t.test('public bot discovery pages and filters in PostgreSQL without loading the full collection',async()=>{
   const otherOwner=crypto.randomUUID(),viewer=crypto.randomUUID(),ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
   const rows=[
    {id:ids[0],ownerId:userId,name:'Alpha Tutor',description:'Math help',isPublic:true,createdAt:'2026-01-01T00:00:00.000Z'},
    {id:ids[1],ownerId:otherOwner,name:'Beta Tutor',description:'Programming help',isPublic:true,createdAt:'2026-01-02T00:00:00.000Z'},
    {id:ids[2],ownerId:otherOwner,name:'Private Tutor',description:'Private bot',isPublic:false,createdAt:'2026-01-03T00:00:00.000Z'}
   ];
   try{
    for(const row of rows)await store.insertAsync('bots',row);
    const first=await store.findPublicBotsPage({ownerId:viewer,query:'tutor',limit:1,offset:0});
    assert.equal(first.total,2);
    assert.deepEqual(first.bots.map(bot=>bot.id),[ids[1]]);
    const second=await store.findPublicBotsPage({ownerId:viewer,query:'tutor',limit:1,offset:1});
    assert.equal(second.total,2);
    assert.deepEqual(second.bots.map(bot=>bot.id),[ids[0]]);
    const ownerView=await store.findPublicBotsPage({ownerId:otherOwner,query:'tutor',limit:10,offset:0});
    assert.deepEqual(ownerView.bots.map(bot=>bot.id),[ids[0]]);
   }finally{for(const id of ids)await store.deleteByIdAsync('bots',id);}
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
