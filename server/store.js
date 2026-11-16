// Async persistence abstraction. JSON remains the zero-config development adapter;
// DATABASE_URL selects PostgreSQL for deployed environments.
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const DB_PATH=process.env.BOTFORGE_DATA_FILE||path.join(__dirname,'..','data','db.json');
const COLLECTIONS=['users','bots','documents','messages','usage','memory'];
let cache=null,pool=null,initialized=false;const localReservations=new Map();
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
 if(isPostgres()){
  pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:process.env.PGSSL_REJECT_UNAUTHORIZED!=='false'},max:Number(process.env.PG_POOL_MAX||10),connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
  await pool.query('SELECT 1');
  await pool.query("CREATE TABLE IF NOT EXISTS botforge_records (collection text NOT NULL CHECK(collection IN ('users','bots','documents','messages','usage','memory')), id uuid NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(collection,id))");
  await pool.query('CREATE INDEX IF NOT EXISTS botforge_records_collection_idx ON botforge_records(collection)');
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS botforge_records_user_email_uidx ON botforge_records((lower(data->>'email'))) WHERE collection='users'");
  await pool.query(`CREATE TABLE IF NOT EXISTS botforge_quota_reservations (id uuid PRIMARY KEY, user_id uuid NOT NULL, usage_day date NOT NULL, expires_at timestamptz NOT NULL)`);
  await pool.query('CREATE INDEX IF NOT EXISTS botforge_quota_user_day_idx ON botforge_quota_reservations(user_id,usage_day,expires_at)');
 } else load();
 initialized=true;
}
function all(collection){const rows=load()[collection];if(!Array.isArray(rows))throw new Error('Unknown data collection: '+collection);return rows;}
function insert(collection,record){const db=load();if(!Array.isArray(db[collection]))throw new Error('Unknown data collection: '+collection);db[collection].push(record);persist();return record;}
function findById(collection,id){return all(collection).find(row=>row.id===id)||null;}
function updateById(collection,id,patch){const db=load(),idx=db[collection].findIndex(row=>row.id===id);if(idx<0)return null;db[collection][idx]={...db[collection][idx],...patch};persist();return db[collection][idx];}
function deleteById(collection,id){const db=load(),before=db[collection].length;db[collection]=db[collection].filter(row=>row.id!==id);persist();return db[collection].length<before;}
function assertCollection(c){if(!COLLECTIONS.includes(c))throw new Error('Unknown data collection: '+c);}
function isUuid(id){return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);}
async function allAsync(c){assertCollection(c);if(!isPostgres())return all(c);await initialize();const r=await pool.query('SELECT data FROM botforge_records WHERE collection=$1 ORDER BY updated_at,id',[c]);return r.rows.map(x=>x.data);}
async function findByIdAsync(c,id){assertCollection(c);if(!isUuid(id))return null;if(!isPostgres())return findById(c,id);await initialize();const r=await pool.query('SELECT data FROM botforge_records WHERE collection=$1 AND id=$2',[c,id]);return r.rowCount?r.rows[0].data:null;}
async function insertAsync(c,record){assertCollection(c);if(!isPostgres())return insert(c,record);await initialize();await pool.query('INSERT INTO botforge_records(collection,id,data) VALUES($1,$2,$3::jsonb)',[c,record.id,JSON.stringify(record)]);return record;}
async function updateByIdAsync(c,id,patch){assertCollection(c);if(!isUuid(id))return null;if(!isPostgres())return updateById(c,id,patch);await initialize();const r=await pool.query("UPDATE botforge_records SET data=data || $3::jsonb,updated_at=now() WHERE collection=$1 AND id=$2 RETURNING data",[c,id,JSON.stringify(patch)]);return r.rowCount?r.rows[0].data:null;}
async function deleteByIdAsync(c,id){assertCollection(c);if(!isUuid(id))return false;if(!isPostgres())return deleteById(c,id);await initialize();const r=await pool.query('DELETE FROM botforge_records WHERE collection=$1 AND id=$2',[c,id]);return r.rowCount>0;}
async function deleteBotAndData(botId){if(!isUuid(botId))return false;if(!isPostgres()){const db=load(),exists=db.bots.some(x=>x.id===botId);if(!exists)return false;db.bots=db.bots.filter(x=>x.id!==botId);for(const c of ['documents','messages','memory','usage'])db[c]=db[c].filter(x=>x.botId!==botId);persist();return true;}await initialize();const client=await pool.connect();try{await client.query('BEGIN');const removed=await client.query("DELETE FROM botforge_records WHERE collection='bots' AND id=$1",[botId]);if(!removed.rowCount){await client.query('ROLLBACK');return false;}for(const c of ['documents','messages','memory','usage'])await client.query("DELETE FROM botforge_records WHERE collection=$1 AND data->>'botId'=$2",[c,botId]);await client.query('COMMIT');return true;}catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}finally{client.release();}}

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
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[userId+':'+day]);
  await client.query('DELETE FROM botforge_quota_reservations WHERE expires_at<=now()');
  const usedResult=await client.query("SELECT count(*)::int AS count FROM botforge_records WHERE collection='usage' AND data->>'userId'=$1 AND data->>'day'=$2",[userId,day]);
  const pendingResult=await client.query('SELECT count(*)::int AS count FROM botforge_quota_reservations WHERE user_id=$1 AND usage_day=$2',[userId,day]);
  const used=usedResult.rows[0].count,pending=pendingResult.rows[0].count;
  if(used+pending>=limit){await client.query('ROLLBACK');const e=new Error('Daily message limit reached. Try again after the daily reset.');e.status=429;throw e;}
  await client.query('INSERT INTO botforge_quota_reservations(id,user_id,usage_day,expires_at) VALUES($1,$2,$3,now()+interval \'15 minutes\')',[reservationId,userId,day]);
  await client.query('COMMIT');return {reservationId,used,pending:pending+1,remaining:Math.max(0,limit-used-pending-1)};
 }catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}finally{client.release();}
}
async function releaseUsageSlot(reservationId){
 if(!reservationId)return;
 if(!isPostgres()){localReservations.delete(reservationId);return;}
 await initialize();await pool.query('DELETE FROM botforge_quota_reservations WHERE id=$1',[reservationId]);
}
async function commitUsageRecord(record,reservationId){
 if(!isPostgres()){insert('usage',record);releaseUsageSlot(reservationId);return record;}
 await initialize();const client=await pool.connect();
 try{await client.query('BEGIN');await client.query('INSERT INTO botforge_records(collection,id,data) VALUES(\'usage\',$1,$2::jsonb)',[record.id,JSON.stringify(record)]);if(reservationId)await client.query('DELETE FROM botforge_quota_reservations WHERE id=$1',[reservationId]);await client.query('COMMIT');return record;}
 catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}finally{client.release();}
}
async function commitChatTurn({userMessage,assistantMessage,usageRecord},reservationId){
 const records=[['messages',userMessage],['messages',assistantMessage],['usage',usageRecord]];
 if(records.some(([collection,record])=>!record||!isUuid(record.id)))throw new Error('Invalid chat turn record.');
 if(!isPostgres()){
  const db=load();
  for(const [collection,record] of records){assertCollection(collection);db[collection].push(record);}
  persist();
  if(reservationId)localReservations.delete(reservationId);
  return {userMessage,assistantMessage,usageRecord};
 }
 await initialize();const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const [collection,record] of records)await client.query('INSERT INTO botforge_records(collection,id,data) VALUES($1,$2,$3::jsonb)',[collection,record.id,JSON.stringify(record)]);
  if(reservationId){const removed=await client.query('DELETE FROM botforge_quota_reservations WHERE id=$1',[reservationId]);if(removed.rowCount!==1)throw new Error('Usage reservation expired before the chat turn could be committed.');}
  await client.query('COMMIT');
  return {userMessage,assistantMessage,usageRecord};
 }catch(e){try{await client.query('ROLLBACK');}catch(_){}throw e;}finally{client.release();}
}
async function usageStats(userId,day){
 if(!isPostgres()){const used=load().usage.filter(x=>x.userId===userId&&x.day===day).length;const now=Date.now();for(const [id,r] of localReservations)if(r.expiresAt<=now)localReservations.delete(id);const pending=[...localReservations.values()].filter(x=>x.userId===userId&&x.day===day).length;return {used,pending};}
 await initialize();const r=await pool.query("SELECT (SELECT count(*)::int FROM botforge_records WHERE collection='usage' AND data->>'userId'=$1 AND data->>'day'=$2) AS used,(SELECT count(*)::int FROM botforge_quota_reservations WHERE user_id=$1 AND usage_day=$2 AND expires_at>now()) AS pending",[userId,day]);return r.rows[0];
}
async function health(){if(!isPostgres())return {ok:true,database:'json-development'};try{await initialize();await pool.query('SELECT 1');return {ok:true,database:'postgres'};}catch(_){return {ok:false,database:'postgres'};}}
async function close(){if(pool){await pool.end();pool=null;}initialized=false;}
module.exports={initialize,close,isPostgres,all,insert,findById,updateById,deleteById,allAsync,findByIdAsync,insertAsync,updateByIdAsync,deleteByIdAsync,deleteBotAndData,reserveUsageSlot,releaseUsageSlot,commitUsageRecord,commitChatTurn,usageStats,health,load,persist};
