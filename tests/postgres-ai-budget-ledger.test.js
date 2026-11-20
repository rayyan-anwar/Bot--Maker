const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');

test('PostgreSQL AI budget ledger transitions, idempotency and reconciliation', {skip:!process.env.BOTFORGE_TEST_DATABASE_URL}, async()=>{
 const client=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});
 await client.connect();
 const expectPgError=async(sql,args,pattern)=>{
  await client.query('SAVEPOINT expected_error');
  try{ await assert.rejects(client.query(sql,args),pattern); }
  finally{ await client.query('ROLLBACK TO SAVEPOINT expected_error'); await client.query('RELEASE SAVEPOINT expected_error'); }
 };
 try{
  await client.query('BEGIN');
  const scopeResult=await client.query(
   `INSERT INTO ai_budget_scopes(scope_type,scope_key,currency,limit_amount,window_start,window_end)
    VALUES('global',$1,'USD',10,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour') RETURNING id`,
   ['test-'+Date.now()]
  );
  const scopeId=scopeResult.rows[0].id;

  const settleKey='req-settle-'+Date.now();
  const reservation=(await client.query(
   'SELECT botforge_reserve_ai_budget($1,$2,$3,$4,$5,$6,$7,NULL) AS id',
   [settleKey,scopeId,'test-model','test-price-v1',1000,1000,4]
  )).rows[0].id;
  const duplicate=(await client.query(
   'SELECT botforge_reserve_ai_budget($1,$2,$3,$4,$5,$6,$7,NULL) AS id',
   [settleKey,scopeId,'test-model','test-price-v1',1000,1000,4]
  )).rows[0].id;
  assert.equal(duplicate,reservation);
  // The same idempotency key is checked separately below using the stable key.
  assert.ok(reservation);
  assert.ok(duplicate);

  await client.query('SELECT botforge_settle_ai_budget($1,$2,$3)',[reservation,2.5,'provider-test-1']);
  const settled=(await client.query('SELECT state,actual_amount FROM ai_budget_reservations WHERE id=$1',[reservation])).rows[0];
  assert.equal(settled.state,'settled');
  assert.equal(Number(settled.actual_amount),2.5);
  await expectPgError('SELECT botforge_settle_ai_budget($1,$2,NULL)',[reservation,3],/conflicting amount or provider request id/);

  const releaseKey='req-release-'+Date.now();
  const releaseId=(await client.query(
   'SELECT botforge_reserve_ai_budget($1,$2,$3,$4,$5,$6,$7,NULL) AS id',
   [releaseKey,scopeId,'test-model','test-price-v1',100,100,1]
  )).rows[0].id;
  assert.equal((await client.query('SELECT botforge_release_ai_budget($1,FALSE) AS state',[releaseId])).rows[0].state,'released');
  assert.equal((await client.query('SELECT botforge_release_ai_budget($1,FALSE) AS state',[releaseId])).rows[0].state,'released');

  const expireKey='req-expire-'+Date.now();
  const expireId=(await client.query(
   'SELECT botforge_reserve_ai_budget($1,$2,$3,$4,$5,$6,$7,NOW()-INTERVAL \'1 second\') AS id',
   [expireKey,scopeId,'test-model','test-price-v1',100,100,1]
  )).rows[0].id;
  assert.equal((await client.query('SELECT botforge_release_ai_budget($1,TRUE) AS state',[expireId])).rows[0].state,'expired');

  const adjustKey='reconcile-'+Date.now();
  const adjust=(await client.query(
   'SELECT botforge_reconcile_ai_budget($1,$2,$3,$4) AS id',
   [scopeId,0.25,adjustKey,'Verified provider invoice correction']
  )).rows[0].id;
  const adjustAgain=(await client.query(
   'SELECT botforge_reconcile_ai_budget($1,$2,$3,$4) AS id',
   [scopeId,0.25,adjustKey,'Verified provider invoice correction']
  )).rows[0].id;
  assert.equal(adjustAgain,adjust);
  await expectPgError('SELECT botforge_reconcile_ai_budget($1,$2,$3,$4)',[scopeId,0.5,adjustKey,'Conflicting correction'],/reconciliation key reused with different parameters/);

  await client.query('ROLLBACK');
 }catch(error){
  try{await client.query('ROLLBACK');}catch{}
  throw error;
 }finally{await client.end();}
});

test('parallel reservations serialize by request key across clients', {skip:!process.env.BOTFORGE_TEST_DATABASE_URL}, async()=>{
 const a=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});
 const b=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});
 const setup=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});
 await Promise.all([a.connect(),b.connect(),setup.connect()]);
 let scopeA,scopeB;
 const key='concurrent-reserve-'+Date.now();
 try{
  const insertScope=async(scopeKey)=> (await setup.query(
   `INSERT INTO ai_budget_scopes(scope_type,scope_key,currency,limit_amount,window_start,window_end)
    VALUES('global',$1,'USD',5,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour') RETURNING id`,
   [scopeKey]
  )).rows[0].id;
  scopeA=await insertScope('concurrency-a-'+Date.now());
  scopeB=await insertScope('concurrency-b-'+Date.now());
  const reserve=(client,scope)=>client.query(
   'SELECT botforge_reserve_ai_budget($1,$2,$3,$4,$5,$6,$7,NULL) AS id',
   [key,scope,'test-model','test-price-v1',1000,1000,2]
  );
  const sameScope=await Promise.all([reserve(a,scopeA),reserve(b,scopeA)]);
  assert.equal(sameScope[0].rows[0].id,sameScope[1].rows[0].id,'parallel retries should return same reservation');
  await assert.rejects(reserve(b,scopeB),/idempotency key reused with different reservation parameters/);
  const counts=await setup.query('SELECT reserved_amount FROM ai_budget_scopes WHERE id=$1',[scopeA]);
  assert.equal(Number(counts.rows[0].reserved_amount),2,'budget should reserve only once');
 }finally{
  if(scopeA||scopeB){
   const ids=[scopeA,scopeB].filter(Boolean);
   await setup.query('DELETE FROM ai_budget_ledger_entries WHERE scope_id=ANY($1::uuid[])',[ids]);
   await setup.query('DELETE FROM ai_budget_reservations WHERE scope_id=ANY($1::uuid[])',[ids]);
   await setup.query('DELETE FROM ai_budget_scopes WHERE id=ANY($1::uuid[])',[ids]);
  }
  await Promise.all([a.end(),b.end(),setup.end()]);
 }
});
