'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');

test('budget alert transition persistence suppresses repeated statuses and records recovery', {skip:!process.env.BOTFORGE_TEST_DATABASE_URL},async()=>{
 const client=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});await client.connect();
 let scopeId;
 try{
  await client.query('BEGIN');
  scopeId=(await client.query(`INSERT INTO ai_budget_scopes(scope_type,scope_key,currency,limit_amount,window_start,window_end)
   VALUES('global',$1,'USD',100,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour') RETURNING id`,['alert-state-test-'+Date.now()])).rows[0].id;
  const snapshot=status=>({status,limitAmount:100,percentUsed:status==='warning'?70:status==='normal'?10:null});
  const first=(await client.query('SELECT botforge_record_ai_budget_alert($1,$2,$3::jsonb) AS transition',[scopeId,'warning',JSON.stringify(snapshot('warning'))])).rows[0].transition;
  assert.equal(first.event,'escalated');assert.equal(first.previous,'normal');assert.equal(first.changed,true);
  const repeat=(await client.query('SELECT botforge_record_ai_budget_alert($1,$2,$3::jsonb) AS transition',[scopeId,'warning',JSON.stringify(snapshot('warning'))])).rows[0].transition;
  assert.equal(repeat.event,null);assert.equal(repeat.changed,false);
  const recovered=(await client.query('SELECT botforge_record_ai_budget_alert($1,$2,$3::jsonb) AS transition',[scopeId,'normal',JSON.stringify(snapshot('normal'))])).rows[0].transition;
  assert.equal(recovered.event,'recovered');assert.equal(recovered.previous,'warning');
  const events=await client.query('SELECT event_type FROM ai_budget_alert_events WHERE scope_id=$1 ORDER BY created_at',[scopeId]);
  assert.deepEqual(events.rows.map(row=>row.event_type),['escalated','recovered']);
  const outbox=await client.query('SELECT event_type,delivery_state,payload FROM ai_budget_alert_outbox WHERE scope_id=$1 ORDER BY created_at',[scopeId]);
  assert.deepEqual(outbox.rows.map(row=>row.event_type),['initial','recovered']);
  assert.ok(outbox.rows.every(row=>row.delivery_state==='pending'));
  assert.equal(outbox.rows[0].payload.eventType,'escalated');
  const state=await client.query('SELECT status,snapshot FROM ai_budget_alert_state WHERE scope_id=$1',[scopeId]);
  assert.equal(state.rows[0].status,'normal');assert.equal(state.rows[0].snapshot.status,'normal');
  await client.query('ROLLBACK');
 }catch(error){try{await client.query('ROLLBACK')}catch{};throw error;}
 finally{await client.end();}
});

test('concurrent identical budget alert snapshots emit only one transition event', {skip:!process.env.BOTFORGE_TEST_DATABASE_URL},async()=>{
 const a=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL}),b=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL}),setup=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});
 await Promise.all([a.connect(),b.connect(),setup.connect()]);let scopeId;
 try{
  scopeId=(await setup.query(`INSERT INTO ai_budget_scopes(scope_type,scope_key,currency,limit_amount,window_start,window_end)
   VALUES('global',$1,'USD',100,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour') RETURNING id`,['alert-concurrent-'+Date.now()])).rows[0].id;
  const snapshot=JSON.stringify({status:'critical',percentUsed:85});
  await Promise.all([a.query('SELECT botforge_record_ai_budget_alert($1,$2,$3::jsonb)',[scopeId,'critical',snapshot]),b.query('SELECT botforge_record_ai_budget_alert($1,$2,$3::jsonb)',[scopeId,'critical',snapshot])]);
  const events=await setup.query('SELECT count(*)::int AS count FROM ai_budget_alert_events WHERE scope_id=$1',[scopeId]);
  assert.equal(events.rows[0].count,1);
 }finally{
  if(scopeId)await setup.query('DELETE FROM ai_budget_scopes WHERE id=$1',[scopeId]);
  await Promise.all([a.end(),b.end(),setup.end()]);
 }
});
