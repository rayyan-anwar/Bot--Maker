'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');

test('alert outbox claims are exclusive, retries are delayed, and delivery completes', {skip:!process.env.BOTFORGE_TEST_DATABASE_URL},async()=>{
 const a=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL}),b=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});
 await Promise.all([a.connect(),b.connect()]);let scopeId;
 try{
  scopeId=(await a.query(`INSERT INTO ai_budget_scopes(scope_type,scope_key,currency,limit_amount,window_start,window_end)
   VALUES('global',$1,'USD',100,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour') RETURNING id`,['outbox-lease-'+Date.now()])).rows[0].id;
  await a.query('SELECT botforge_record_ai_budget_alert($1,$2,$3::jsonb)',[scopeId,'warning',JSON.stringify({status:'warning'})]);
  const [claimA,claimB]=await Promise.all([
   a.query('SELECT * FROM botforge_claim_ai_budget_alert_outbox(1,30)'),
   b.query('SELECT * FROM botforge_claim_ai_budget_alert_outbox(1,30)')
  ]);
  assert.equal(claimA.rowCount+claimB.rowCount,1,'only one worker may claim the same event');
  const claimed=claimA.rows[0]||claimB.rows[0];
  assert.equal(claimed.delivery_state,'attempted');assert.equal(claimed.attempts,1);
  const owner=claimA.rowCount?a:b,other=claimA.rowCount?b:a;
  const fail=(await owner.query('SELECT botforge_finish_ai_budget_alert_outbox($1,false,$2,60,3) AS result',[claimed.id,'temporary provider outage'])).rows[0].result;
  assert.equal(fail.state,'pending');
  const tooEarly=await other.query('SELECT * FROM botforge_claim_ai_budget_alert_outbox(1,30)');
  assert.equal(tooEarly.rowCount,0,'retry must respect available_at backoff');
  await other.query('UPDATE ai_budget_alert_outbox SET available_at=NOW() WHERE id=$1',[claimed.id]);
  const second=await other.query('SELECT * FROM botforge_claim_ai_budget_alert_outbox(1,30)');
  assert.equal(second.rowCount,1);assert.equal(second.rows[0].attempts,2);
  const done=(await other.query('SELECT botforge_finish_ai_budget_alert_outbox($1,true,NULL,60,3) AS result',[claimed.id])).rows[0].result;
  assert.equal(done.state,'delivered');
  const duplicate=(await owner.query('SELECT botforge_finish_ai_budget_alert_outbox($1,true,NULL,60,3) AS result',[claimed.id])).rows[0].result;
  assert.equal(duplicate.updated,false);
  const row=(await owner.query('SELECT delivery_state,attempts,delivered_at FROM ai_budget_alert_outbox WHERE id=$1',[claimed.id])).rows[0];
  assert.equal(row.delivery_state,'delivered');assert.equal(row.attempts,2);assert.ok(row.delivered_at);
 }finally{
  if(scopeId)await a.query('DELETE FROM ai_budget_scopes WHERE id=$1',[scopeId]);
  await Promise.all([a.end(),b.end()]);
 }
});

test('expired outbox lease can be reclaimed after worker interruption', {skip:!process.env.BOTFORGE_TEST_DATABASE_URL},async()=>{
 const client=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});await client.connect();let scopeId;
 try{
  scopeId=(await client.query(`INSERT INTO ai_budget_scopes(scope_type,scope_key,currency,limit_amount,window_start,window_end)
   VALUES('global',$1,'USD',100,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour') RETURNING id`,['outbox-reclaim-'+Date.now()])).rows[0].id;
  await client.query('SELECT botforge_record_ai_budget_alert($1,$2,$3::jsonb)',[scopeId,'critical',JSON.stringify({status:'critical'})]);
  const first=(await client.query('SELECT * FROM botforge_claim_ai_budget_alert_outbox(1,30)')).rows[0];
  assert.equal(first.attempts,1);
  await client.query('UPDATE ai_budget_alert_outbox SET lease_until=NOW()-INTERVAL \'1 second\' WHERE id=$1',[first.id]);
  const reclaimed=(await client.query('SELECT * FROM botforge_claim_ai_budget_alert_outbox(1,30)')).rows[0];
  assert.equal(reclaimed.id,first.id);assert.equal(reclaimed.attempts,2);
  const failed=(await client.query('SELECT botforge_finish_ai_budget_alert_outbox($1,false,$2,1,2) AS result',[first.id,'provider unavailable'])).rows[0].result;
  assert.equal(failed.state,'failed');
 }finally{
  if(scopeId)await client.query('DELETE FROM ai_budget_scopes WHERE id=$1',[scopeId]);
  await client.end();
 }
});
