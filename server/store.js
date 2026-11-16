// Async persistence abstraction. JSON remains the zero-config development adapter;
// DATABASE_URL selects PostgreSQL for deployed environments.
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const DB_PATH=process.env.BOTFORGE_DATA_FILE||path.join(__dirname,'..','data','db.json');
const COLLECTIONS=['users','bots','documents','messages','usage','memory'];
let cache=null,pool=null,initialized=false;
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
 } else load();
 initialized=true;
}
function all(collection){const rows=load()[collection];if(!Array.isArray(rows))throw new Error('Unknown data collection: '+collection);return rows;}
function insert(collection,record){const db=load();if(!Array.isArray(db[collection]))throw new Error('Unknown data collection: '+collection);db[collection].push(record);persist();return record;}
function findById(collection,id){return all(collection).find(row=>row.id===id)||null;}
function updateById(collection,id,patch){const db=load(),idx=db[collection].findIndex(row=>row.id===id);if(idx<0)return null;db[collection][idx]={...db[collection][idx],...patch};persist();return db[collection][idx];}
function deleteById(collection,id){const db=load(),before=db[collection].length;db[collection]=db[collection].filter(row=>row.id!==id);persist();return db[collection].length<before;}
function assertCollection(c){if(!COLLECTIONS.includes(c))throw new Error('Unknown data collection: '+c);}
async function allAsync(c){assertCollection(c);if(!isPostgres())return all(c);await initialize();const r=await pool.query('SELECT data FROM botforge_records WHERE collection=$1 ORDER BY updated_at,id',[c]);return r.rows.map(x=>x.data);}
async function findByIdAsync(c,id){assertCollection(c);if(!isPostgres())return findById(c,id);await initialize();const r=await pool.query('SELECT data FROM botforge_records WHERE collection=$1 AND id=$2',[c,id]);return r.rowCount?r.rows[0].data:null;}
async function insertAsync(c,record){assertCollection(c);if(!isPostgres())return insert(c,record);await initialize();await pool.query('INSERT INTO botforge_records(collection,id,data) VALUES($1,$2,$3::jsonb)',[c,record.id,JSON.stringify(record)]);return record;}
async function updateByIdAsync(c,id,patch){assertCollection(c);if(!isPostgres())return updateById(c,id,patch);await initialize();const r=await pool.query("UPDATE botforge_records SET data=data || $3::jsonb,updated_at=now() WHERE collection=$1 AND id=$2 RETURNING data",[c,id,JSON.stringify(patch)]);return r.rowCount?r.rows[0].data:null;}
async function deleteByIdAsync(c,id){assertCollection(c);if(!isPostgres())return deleteById(c,id);await initialize();const r=await pool.query('DELETE FROM botforge_records WHERE collection=$1 AND id=$2',[c,id]);return r.rowCount>0;}
async function deleteBotData(botId){if(!isPostgres()){const db=load();for(const c of ['documents','messages','memory','usage'])db[c]=db[c].filter(x=>x.botId!==botId);persist();return;}await initialize();const client=await pool.connect();try{await client.query('BEGIN');for(const c of ['documents','messages','memory','usage'])await client.query("DELETE FROM botforge_records WHERE collection=$1 AND data->>'botId'=$2",[c,botId]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
async function close(){if(pool){await pool.end();pool=null;}initialized=false;}
module.exports={initialize,close,isPostgres,all,insert,findById,updateById,deleteById,allAsync,findByIdAsync,insertAsync,updateByIdAsync,deleteByIdAsync,deleteBotData,load,persist};
