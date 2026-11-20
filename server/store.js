// Async persistence abstraction. JSON is the zero-config development adapter;
// DATABASE_URL selects PostgreSQL for deployed environments.
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const DB_PATH=process.env.BOTFORGE_DATA_FILE||path.join(__dirname,'..','data','db.json');
const COLLECTIONS=['users','bots','botVersions','documents','messages','usage','memory','webhookEvents','settings','aiEngineerRuns','aiEngineerApprovals','socialOAuthStates','socialConnections'];
let cache=null,pool=null,initialized=false,initializationPromise=null;
const localReservations=new Map();
function emptyDB(){return Object.fromEntries(COLLECTIONS.map(k=>[k,[]]));}
function load(){
 if(cache)return cache;
 if(!fs.existsSync(DB_PATH)){cache=emptyDB();persist();return cache;}
 try{cache=JSON.parse(fs.readFileSync(DB_PATH,'utf8'));for(const key of COLLECTIONS)if(!Array.isArray(cache[key]))cache[key]=[];return cache;}
 catch(err){throw new Error('Database file is unreadable; restore from backup before restarting: '+err.message);}
}
function persist(){fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});const temp=DB_PATH+'.tmp';fs.writeFileSync(temp,JSON.stringify(cache,null,2),{mode:0o600});fs.renameSync(temp,DB_PATH);}
function isPostgres(){return !!process.env.DATABASE_URL;}
async function initialize(){
 if(initialized)return;
 if(initializationPromise)return initializationPromise;
 initializationPromise=(async()=>{
  if(isPostgres()){
   pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:process.env.PGSSL_REJECT_UNAUTHORIZED!=='false'},max:Number(process.env.PG_POOL_MAX||10),connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
   try{
    await pool.query('SELECT 1');
    await pool.query("CREATE TABLE IF NOT EXISTS botforge_records (collection text NOT NULL CHECK(collection IN ('users','bots','botVersions','documents','messages','usage','memory','settings','aiEngineerRuns','aiEngineerApprovals','socialOAuthStates','socialConnections')), id uuid NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(collection,id))");
    await pool.query('CREATE INDEX IF NOT EXISTS botforge_records_collection_idx ON botforge_records(collection)');
    await pool.query('ALTER TABLE botforge_records DROP CONSTRAINT IF EXISTS botforge_records_collection_check');
    await pool.query("ALTER TABLE botforge_records ADD CONSTRAINT botforge_records_collection_check CHECK(collection IN ('users','bots','botVersions','documents','messages','usage','memory','settings','aiEngineerRuns','aiEngineerApprovals','socialOAuthStates'))");
    await pool.query("CREATE INDEX IF NOT EXISTS botforge_records_user_reset_token_idx ON botforge_records((data->>'passwordResetTokenHash')) WHERE collection='users'");
    await pool.query('CREATE TABLE IF NOT EXISTS botforge_webhook_events (provider text NOT NULL, event_id text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,event_id))');
    await pool.query('ALTER TABLE botforge_webhook_events ADD COLUMN IF NOT EXISTS processing_until timestamptz');
    await pool.query('ALTER TABLE botforge_webhook_events ADD COLUMN IF NOT EXISTS processed_at timestamptz');
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS botforge_records_user_email_uidx ON botforge_records((lower(data->>'email'))) WHERE collection='users'");
    await pool.query('CREATE TABLE IF NOT EXISTS botforge_quota_reservations (id uuid PRIMARY KEY, user_id uuid NOT NULL, usage_day date NOT NULL, expires_at timestamptz NOT NULL)');
    await pool.query('CREATE INDEX IF NOT EXISTS botforge_quota_user_day_idx ON botforge_quota_reservations(user_id,usage_day,expires_at)');
    await pool.query('CREATE TABLE IF NOT EXISTS botforge_rate_limits (rate_key text PRIMARY KEY, window_started_at timestamptz NOT NULL, hits integer NOT NULL CHECK(hits>=0), expires_at timestamptz NOT NULL)');
    await pool.query('CREATE INDEX IF NOT EXISTS botforge_rate_limits_expiry_idx ON botforge_rate_limits(expires_at)');
   }catch(error){const failedPool=pool;pool=null;try{await failedPool.end();}catch(_){}throw error;}
  }else load();
  initialized=true;
 })().finally(()=>{initializationPromise=null;});
 return initializationPromise;
}
function all(collection){const rows=load()[collection];if(!Array.isArray(rows))throw new Error('Unknown data collection: '+collection);return rows;}
function insert(collection,record){const db=load();if(!Array.isArray(db[collection]))throw new Error('Unknown data collection: '+collection);db[collection].push(record);persist();return record;}
function findById(collection,id){return all(collection).find(row=>row.id===id)||null;}
function updateById(collection,id,patch){const db=load(),idx=db[collection].findIndex(row=>row.id===id);if(idx<0)return null;db[collection][idx]={...db[collection][idx],...patch};persist();return db[collection][idx];}
function deleteById(collection,id){const db=load(),before=db[collection].length;db[collection]=db[collection].filter(row=>row.id!==id);persist();return db[collection].length<before;}
function assertCollection(c){if(!COLLECTIONS.includes(c))throw new Error('Unknown data collection: '+c);}
function isUuid(id){return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);}
async function allAsync(c){assertCollection(c);if(!isPostgres())return all(c);await initialize();const r=await pool.query('SELECT data FROM botforge_records WHERE collection=$1 ORDER BY updated_at,id',[c]);return r.rows.map(x=>x.data);}
async function findManyAsync(c,filters={}){assertCollection(c);const allowed=new Set(['ownerId','botId','userId','isPublic','email']);const entries=Object.entries(filters);if(entries.some(([key,value])=>!allowed.has(key)||value===undefined||value===null))throw new Error('Unsupported data filter.');if(!isPostgres())return all(c).filter(row=>entries.every(([key,value])=>row[key]===value));await initialize();if(!entries.length)return allAsync(c);const clauses=entries.map((_,i)=>`data->>$${i*2+3}=$${i*2+2}`);const values=[c,...entries.flatMap(([key,value])=>[String(value),key])];const result=await pool.query(`SELECT data FROM botforge_records WHERE collection=$1 AND ${clauses.join(' AND ')} ORDER BY updated_at,id`,values);return result.rows.map(row=>row.data);}
async function findByIdAsync(c,id){assertCollection(c);if(!isUuid(id))return null;if(!isPostgres())return findById(c,id);await initialize();const r=await pool.query('SELECT data FROM botforge_records WHERE collection=$1 AND id=$2',[c,id]);return r.rowCount?r.rows[0].data:null;}
async function insertAsync(c,record){assertCollection(c);if(!isPostgres()){if(c==='users'&&all('users').some(u=>String(u.email).toLowerCase()===String(record.email).toLowerCase())){const e=new Error('Duplicate user email.');e.code='23505';throw e;}return insert(c,record);}await initialize();await pool.query('INSERT INTO botforge_records(collection,id,data) VALUES($1,$2,$3::jsonb)',[c,record.id,JSON.stringify(record)]);return record;}
async function updateByIdAsync(c,id,patch){assertCollection(c);if(!isUuid(id))return null;if(!isPostgres())return updateById(c,id,patch);await initialize();const r=await pool.query("UPDATE botforge_records SET data=data || $3::jsonb,updated_at=now() WHERE collection=$1 AND id=$2 RETURNING data",[c,id,JSON.stringify(patch)]);return r.rowCount?r.rows[0].data:null;}
async function deleteByIdAsync(c,id){assertCollection(c);if(!isUuid(id))return false;if(!isPostgres())return deleteById(c,id);await initialize();const r=await pool.query('DELETE FROM botforge_records WHERE collection=$1 AND id=$2',[c,id]);return r.rowCount>0;}
async function findUserByPasswordResetTokenHash(tokenHash){
 if(typeof tokenHash!=='string'||!tokenHash)return null;
 if(!isPostgres())return all('users').find(row=>row.passwordResetTokenHash===tokenHash)||null;
 await initialize();
 const result=await pool.query("SELECT data FROM botforge_records WHERE collection='users' AND data->>'passwordResetTokenHash'=$1 LIMIT 1",[tokenHash]);
 return result.rowCount?result.rows[0].data:null;
}
async function consumePasswordResetToken(tokenHash,patch){
 if(typeof tokenHash!=='string'||!tokenHash) return null;
 if(!isPostgres()){
  const user=all('users').find(row=>row.passwordResetTokenHash===tokenHash&&row.passwordResetExpiresAt&&Date.parse(row.passwordResetExpiresAt)>Date.now());
  return user?updateById('users',user.id,patch):null;
 }
 await initialize();
 const result=await pool.query("UPDATE botforge_records SET data=data || $2::jsonb,updated_at=now() WHERE collection='users' AND data->>'passwordResetTokenHash'=$1 AND NULLIF(data->>'passwordResetExpiresAt','') IS NOT NULL AND (data->>'passwordResetExpiresAt')::timestamptz>now() RETURNING data",[tokenHash,JSON.stringify(patch)]);
 return result.rowCount?result.rows[0].data:null;
}
async function deleteBotAndData(botId){
 if(!isUuid(botId))return false;
 if(!isPostgres()){const db=load(),exists=db.bots.some(x=>x.id===botId);if(!exists)return false;db.bots=db.bots.filter(x=>x.id!==botId);for(const c of ['botVersions','documents','messages','memory','usage'])db[c]=db[c].filter(x=>x.botId!==botId);persist();return true;}
 await initialize();const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const removed=await client.query("DELETE FROM botforge_records WHERE collection='bots' AND id=$1",[botId]);
  if(!removed.rowCount){await client.query('ROLLBACK');return false;}
  for(const c of ['botVersions','documents','messages','memory','usage'])await client.query("DELETE FROM botforge_records WHERE collection=$1 AND data->>'botId'=$2",[c,botId]);
  await client.query('COMMIT');return true;
 }catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}
 finally{client.release();}
}
async function reserveUsageSlot(userId,limit,day){
 if(!isUuid(userId))throw new Error('Invalid user identifier.');
 const reservationId=require('node:crypto').randomUUID();
 if(!isPostgres()){
  const now=Date.now();for(const [id,r] of localReservations)if(r.expiresAt<=now)localReservations.delete(id);
  const used=load().usage.filter(x=>x.userId===userId&&x.day===day).length;
  const pending=[...localReservations.values()].filter(x=>x.userId===userId&&x.day===day).length;
  if(used+pending>=limit){const e=new Error('Daily message limit reached. Try again after the daily reset.');e.status=429;throw e;}
  localReservations.set(reservationId,{userId,day,expiresAt:now+15*60*1000});
  return {reservationId,used,pending:pending+1,remaining:Math.max(0,limit-used-pending-1)};
 }
 await initialize();const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[userId+':'+day]);await client.query('DELETE FROM botforge_quota_reservations WHERE expires_at<=now()');
  const usedResult=await client.query("SELECT count(*)::int AS count FROM botforge_records WHERE collection='usage' AND data->>'userId'=$1 AND data->>'day'=$2",[userId,day]);
  const pendingResult=await client.query('SELECT count(*)::int AS count FROM botforge_quota_reservations WHERE user_id=$1 AND usage_day=$2',[userId,day]);
  const used=usedResult.rows[0].count,pending=pendingResult.rows[0].count;
  if(used+pending>=limit){await client.query('ROLLBACK');const e=new Error('Daily message limit reached. Try again after the daily reset.');e.status=429;throw e;}
  await client.query("INSERT INTO botforge_quota_reservations(id,user_id,usage_day,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes')",[reservationId,userId,day]);
  await client.query('COMMIT');return {reservationId,used,pending:pending+1,remaining:Math.max(0,limit-used-pending-1)};
 }catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}finally{client.release();}
}
async function releaseUsageSlot(reservationId){if(!reservationId)return;if(!isPostgres()){localReservations.delete(reservationId);return;}await initialize();await pool.query('DELETE FROM botforge_quota_reservations WHERE id=$1',[reservationId]);}
async function commitUsageRecord(record,reservationId){
 if(!isPostgres()){if(reservationId&&!localReservations.has(reservationId))throw new Error('Usage reservation expired before the usage record could be committed.');insert('usage',record);releaseUsageSlot(reservationId);return record;}
 await initialize();const client=await pool.connect();
 try{await client.query('BEGIN');await client.query("INSERT INTO botforge_records(collection,id,data) VALUES('usage',$1,$2::jsonb)",[record.id,JSON.stringify(record)]);if(reservationId){const removed=await client.query('DELETE FROM botforge_quota_reservations WHERE id=$1',[reservationId]);if(removed.rowCount!==1)throw new Error('Usage reservation expired before the usage record could be committed.');}await client.query('COMMIT');return record;}
 catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}finally{client.release();}
}
async function commitChatTurn({userMessage,assistantMessage,usageRecord},reservationId){
 const records=[['messages',userMessage],['messages',assistantMessage],['usage',usageRecord]];
 if(records.some(([collection,record])=>!record||!isUuid(record.id)))throw new Error('Invalid chat turn record.');
 if(!isPostgres()){if(reservationId&&!localReservations.has(reservationId))throw new Error('Usage reservation expired before the chat turn could be committed.');const db=load();for(const [collection,record] of records){assertCollection(collection);db[collection].push(record);}persist();if(reservationId)localReservations.delete(reservationId);return {userMessage,assistantMessage,usageRecord};}
 await initialize();const client=await pool.connect();
 try{await client.query('BEGIN');for(const [collection,record] of records)await client.query('INSERT INTO botforge_records(collection,id,data) VALUES($1,$2,$3::jsonb)',[collection,record.id,JSON.stringify(record)]);if(reservationId){const removed=await client.query('DELETE FROM botforge_quota_reservations WHERE id=$1',[reservationId]);if(removed.rowCount!==1)throw new Error('Usage reservation expired before the chat turn could be committed.');}await client.query('COMMIT');return {userMessage,assistantMessage,usageRecord};}
 catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}finally{client.release();}
}
async function usageStats(userId,day){
 if(!isPostgres()){const used=load().usage.filter(x=>x.userId===userId&&x.day===day).length;const now=Date.now();for(const [id,r] of localReservations)if(r.expiresAt<=now)localReservations.delete(id);const pending=[...localReservations.values()].filter(x=>x.userId===userId&&x.day===day).length;return {used,pending};}
 await initialize();const r=await pool.query("SELECT (SELECT count(*)::int FROM botforge_records WHERE collection='usage' AND data->>'userId'=$1 AND data->>'day'=$3) AS used,(SELECT count(*)::int FROM botforge_quota_reservations WHERE user_id=$2::uuid AND usage_day=$4::date AND expires_at>now()) AS pending",[String(userId),userId,String(day),day]);return r.rows[0];
}
async function claimWebhookEvent(provider,eventId){
 if(!['stripe','razorpay'].includes(provider)||typeof eventId!=='string'||!eventId.trim()||eventId.length>255)throw new Error('Invalid webhook event identity.');
 if(!isPostgres()){
  const events=all('webhookEvents'),existing=events.find(x=>x.provider===provider&&x.eventId===eventId),now=Date.now();
  if(existing?.processedAt)return false;
  if(existing?.processingUntil&&Date.parse(existing.processingUntil)>now){const error=new Error('Webhook event is already being processed.');error.status=409;throw error;}
  if(existing){existing.processingUntil=new Date(now+5*60*1000).toISOString();persist();return true;}
  insert('webhookEvents',{id:require('node:crypto').randomUUID(),provider,eventId,receivedAt:new Date().toISOString(),processingUntil:new Date(now+5*60*1000).toISOString(),processedAt:null});return true;
 }
 await initialize();
 const claimed=await pool.query("INSERT INTO botforge_webhook_events(provider,event_id,processing_until) VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT(provider,event_id) DO UPDATE SET processing_until=now()+interval '5 minutes' WHERE botforge_webhook_events.processed_at IS NULL AND (botforge_webhook_events.processing_until IS NULL OR botforge_webhook_events.processing_until<=now()) RETURNING event_id",[provider,eventId]);
 if(claimed.rowCount===1)return true;
 const existing=await pool.query('SELECT processed_at FROM botforge_webhook_events WHERE provider=$1 AND event_id=$2',[provider,eventId]);
 if(existing.rows[0]?.processed_at)return false;
 const error=new Error('Webhook event is already being processed.');error.status=409;throw error;
}
async function completeWebhookEvent(provider,eventId){
 if(!['stripe','razorpay'].includes(provider)||typeof eventId!=='string'||!eventId)return;
 if(!isPostgres()){const event=all('webhookEvents').find(x=>x.provider===provider&&x.eventId===eventId);if(!event)throw new Error('Webhook event claim was lost.');event.processedAt=new Date().toISOString();event.processingUntil=null;persist();return;}
 await initialize();const result=await pool.query('UPDATE botforge_webhook_events SET processed_at=now(),processing_until=NULL WHERE provider=$1 AND event_id=$2 AND processed_at IS NULL',[provider,eventId]);if(result.rowCount!==1)throw new Error('Webhook event claim was lost.');
}
async function releaseWebhookEvent(provider,eventId){
 if(!['stripe','razorpay'].includes(provider)||typeof eventId!=='string'||!eventId)return;
 if(!isPostgres()){const db=load();db.webhookEvents=db.webhookEvents.filter(x=>!(x.provider===provider&&x.eventId===eventId));persist();return;}
 await initialize();await pool.query('DELETE FROM botforge_webhook_events WHERE provider=$1 AND event_id=$2 AND processed_at IS NULL',[provider,eventId]);
}

async function recordFailedLoginAttempt(userId,maxAttempts=3){
 if(!isUuid(userId)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>20)throw new Error('Invalid failed-login update.');
 if(!isPostgres()){
  const user=findById('users',userId);if(!user)return null;
  const attempts=Math.min(maxAttempts,Number(user.failedLoginAttempts||0)+1),lockedAt=attempts>=maxAttempts?(user.lockedAt||new Date().toISOString()):user.lockedAt||null;
  updateById('users',userId,{failedLoginAttempts:attempts,...(lockedAt?{lockedAt}:{})});
  return {attempts,locked:!!lockedAt,lockedAt};
 }
 await initialize();
 const result=await pool.query(
  "UPDATE botforge_records SET data=data || jsonb_build_object('failedLoginAttempts',LEAST($2::int,COALESCE((data->>'failedLoginAttempts')::int,0)+1),'lockedAt',CASE WHEN COALESCE((data->>'failedLoginAttempts')::int,0)+1 >= $2::int THEN to_jsonb(COALESCE(NULLIF(data->>'lockedAt',''),now()::text)) ELSE COALESCE(data->'lockedAt','null'::jsonb) END),updated_at=now() WHERE collection='users' AND id=$1 RETURNING (data->>'failedLoginAttempts')::int AS attempts,data->>'lockedAt' AS locked_at",
  [userId,maxAttempts]
 );
 if(!result.rowCount)return null;
 return {attempts:result.rows[0].attempts,locked:!!result.rows[0].locked_at,lockedAt:result.rows[0].locked_at};
}

async function getEngineerApproval(id){
 if(!isUuid(id))return null;
 return findByIdAsync('aiEngineerApprovals',id);
}
async function claimEngineerApproval(id,actorId,leaseMs=5*60*1000){
 if(!isUuid(id)||typeof actorId!=='string'||!actorId)return {state:'invalid',approval:null};
 const now=Date.now(),leaseUntil=new Date(now+Math.max(30000,Math.min(leaseMs,10*60*1000))).toISOString();
 if(!isPostgres()){
  const current=findById('aiEngineerApprovals',id);
  if(!current||current.actorId!==actorId)return {state:'invalid',approval:null};
  if(current.status==='created')return {state:'created',approval:current};
  if(current.status==='pending'&&Date.parse(current.expiresAt)<=now)return {state:'expired',approval:current};
  if(current.status==='creating'&&Date.parse(current.leaseUntil)>now)return {state:'in_progress',approval:current};
  if(!['pending','creating'].includes(current.status))return {state:'unavailable',approval:current};
  const updated=updateById('aiEngineerApprovals',id,{status:'creating',leaseUntil,updatedAt:new Date(now).toISOString(),attempts:Number(current.attempts||0)+1});
  return {state:'claimed',approval:updated};
 }
 await initialize();
 const claimed=await pool.query("UPDATE botforge_records SET data=data || jsonb_build_object('status','creating','leaseUntil',$3::text,'updatedAt',$4::text,'attempts',COALESCE((data->>'attempts')::int,0)+1),updated_at=now() WHERE collection='aiEngineerApprovals' AND id=$1 AND data->>'actorId'=$2 AND ((data->>'status'='pending' AND NULLIF(data->>'expiresAt','')::timestamptz>now()) OR (data->>'status'='creating' AND NULLIF(data->>'leaseUntil','')::timestamptz<=now())) RETURNING data",[id,actorId,leaseUntil,new Date(now).toISOString()]);
 if(claimed.rowCount)return {state:'claimed',approval:claimed.rows[0].data};
 const current=await getEngineerApproval(id);
 if(!current||current.actorId!==actorId)return {state:'invalid',approval:null};
 if(current.status==='created')return {state:'created',approval:current};
 if(current.status==='pending'&&Date.parse(current.expiresAt)<=now)return {state:'expired',approval:current};
 if(current.status==='creating'&&Date.parse(current.leaseUntil)>now)return {state:'in_progress',approval:current};
 return {state:'unavailable',approval:current};
}
async function updateEngineerApproval(id,actorId,patch){
 const current=await getEngineerApproval(id);
 if(!current||current.actorId!==actorId)return null;
 return updateByIdAsync('aiEngineerApprovals',id,{...patch,updatedAt:new Date().toISOString()});
}
async function consumeSocialOAuthState(stateHash,userId,platform,now=new Date()){
 if(typeof stateHash!=='string'||typeof userId!=='string'||typeof platform!=='string')return null;
 if(!isPostgres()){
  const rows=all('socialOAuthStates'),index=rows.findIndex(row=>row.stateHash===stateHash);
  if(index<0)return null;
  const record=rows[index];
  if(record.userId!==userId||record.platform!==platform||Date.parse(record.expiresAt)<=now.getTime())return null;
  rows.splice(index,1);persist();return record;
 }
 await initialize();
 const result=await pool.query("DELETE FROM botforge_records WHERE collection='socialOAuthStates' AND data->>'stateHash'=$1 AND data->>'userId'=$2 AND data->>'platform'=$3 AND (data->>'expiresAt')::timestamptz>$4 RETURNING data",[stateHash,userId,platform,now]);
 return result.rowCount?result.rows[0].data:null;
}
async function query(sql,values=[]){if(!isPostgres())throw new Error('Shared PostgreSQL storage is not configured.');await initialize();return pool.query(sql,values);}
async function health(){if(!isPostgres())return {ok:true,database:'json-development'};try{await initialize();await pool.query('SELECT 1');return {ok:true,database:'postgres'};}catch(_){return {ok:false,database:'postgres'};}}
async function close(){if(pool){await pool.end();pool=null;}initialized=false;}
module.exports={initialize,close,isPostgres,all,insert,findById,updateById,deleteById,allAsync,findManyAsync,findByIdAsync,insertAsync,updateByIdAsync,deleteByIdAsync,deleteBotAndData,findUserByPasswordResetTokenHash,consumePasswordResetToken,reserveUsageSlot,releaseUsageSlot,commitUsageRecord,commitChatTurn,usageStats,claimWebhookEvent,completeWebhookEvent,releaseWebhookEvent,recordFailedLoginAttempt,getEngineerApproval,claimEngineerApproval,updateEngineerApproval,consumeSocialOAuthState,query,health,load,persist};
