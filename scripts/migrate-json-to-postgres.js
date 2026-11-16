#!/usr/bin/env node
// One-time, transactional migration from BotForge's local JSON store to PostgreSQL.
// Always back up the source JSON file and run --dry-run before the real import.
require('dotenv').config();
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Client}=require('pg');

const dataPath=process.env.BOTFORGE_DATA_FILE||path.join(__dirname,'..','data','db.json');
const schemaPath=path.join(__dirname,'..','migrations','001_initial_schema.sql');
const collections=['users','bots','documents','messages','usage','memory'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readData(file=dataPath){
 if(!fs.existsSync(file))throw new Error('JSON data file not found: '+file);
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const key of collections)if(!Array.isArray(data[key]))throw new Error('Invalid JSON store: expected an array named '+key+'.');
 return data;
}
function requireUuid(value,label){
 if(typeof value!=='string'||!UUID.test(value))throw new Error('Preflight failed: '+label+' must be a valid UUID.');
}
function requireText(value,label,max=1000000){
 if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Preflight failed: '+label+' must be non-empty text of at most '+max+' characters.');
}
function validDate(value,label){
 if(value!==undefined&&value!==null&&Number.isNaN(new Date(value).getTime()))throw new Error('Preflight failed: invalid date for '+label+'.');
 return value?new Date(value):new Date();
}
function validateData(data){
 const ids={users:new Set(),bots:new Set(),documents:new Set(),messages:new Set(),usage:new Set(),memory:new Set()};
 const emailSet=new Set();
 for(const u of data.users){
  requireUuid(u.id,'user.id');requireText(u.email,'user.email',254);requireText(u.name,'user.name',80);requireText(u.passwordHash,'user.passwordHash',200);
  const email=u.email.trim().toLowerCase();if(emailSet.has(email))throw new Error('Preflight failed: duplicate user email '+email+'.');emailSet.add(email);
  if(ids.users.has(u.id))throw new Error('Preflight failed: duplicate user id '+u.id+'.');ids.users.add(u.id);validDate(u.createdAt,'user.createdAt');
 }
 for(const b of data.bots){
  requireUuid(b.id,'bot.id');requireUuid(b.ownerId,'bot.ownerId');if(!ids.users.has(b.ownerId))throw new Error('Preflight failed: bot owner does not exist ('+b.id+').');
  requireText(b.name,'bot.name',80);requireText(b.instructions,'bot.instructions',6000);
  if(!['anthropic','openai','gemini'].includes(b.provider||'anthropic'))throw new Error('Preflight failed: unsupported provider on bot '+b.id+'.');
  if(ids.bots.has(b.id))throw new Error('Preflight failed: duplicate bot id '+b.id+'.');ids.bots.add(b.id);validDate(b.createdAt,'bot.createdAt');
 }
 for(const d of data.documents){
  requireUuid(d.id,'document.id');requireUuid(d.botId,'document.botId');if(!ids.bots.has(d.botId))throw new Error('Preflight failed: document references missing bot '+d.botId+'.');
  requireText(d.filename,'document.filename',180);if(!Array.isArray(d.chunks))throw new Error('Preflight failed: document chunks must be an array.');
  if(ids.documents.has(d.id))throw new Error('Preflight failed: duplicate document id '+d.id+'.');ids.documents.add(d.id);validDate(d.createdAt,'document.createdAt');
  const chunkIds=new Set();for(const chunk of d.chunks){requireUuid(chunk.id,'document chunk id');requireText(chunk.text,'document chunk text');if(chunkIds.has(chunk.id))throw new Error('Preflight failed: duplicate chunk id '+chunk.id+'.');chunkIds.add(chunk.id);}
 }
 for(const m of data.messages){
  requireUuid(m.id,'message.id');requireUuid(m.botId,'message.botId');requireUuid(m.userId,'message.userId');
  if(!ids.bots.has(m.botId)||!ids.users.has(m.userId))throw new Error('Preflight failed: message references a missing user or bot ('+m.id+').');
  if(!['user','assistant'].includes(m.role))throw new Error('Preflight failed: invalid message role ('+m.id+').');requireText(m.content,'message.content');
  if(ids.messages.has(m.id))throw new Error('Preflight failed: duplicate message id '+m.id+'.');ids.messages.add(m.id);validDate(m.createdAt,'message.createdAt');
 }
 for(const u of data.usage){
  requireUuid(u.id,'usage.id');requireUuid(u.userId,'usage.userId');if(!ids.users.has(u.userId))throw new Error('Preflight failed: usage references missing user ('+u.id+').');
  if(u.botId!==null&&u.botId!==undefined){requireUuid(u.botId,'usage.botId');if(!ids.bots.has(u.botId))throw new Error('Preflight failed: usage references missing bot ('+u.id+').');}
  requireText(u.provider,'usage.provider',32);if(ids.usage.has(u.id))throw new Error('Preflight failed: duplicate usage id '+u.id+'.');ids.usage.add(u.id);validDate(u.createdAt,'usage.createdAt');
 }
 for(const m of data.memory){
  requireUuid(m.id,'memory.id');requireUuid(m.botId,'memory.botId');requireUuid(m.userId,'memory.userId');
  if(!ids.bots.has(m.botId)||!ids.users.has(m.userId))throw new Error('Preflight failed: memory references a missing user or bot ('+m.id+').');
  requireText(m.content,'memory.content',500);if(ids.memory.has(m.id))throw new Error('Preflight failed: duplicate memory id '+m.id+'.');ids.memory.add(m.id);validDate(m.createdAt,'memory.createdAt');
 }
 return Object.fromEntries(collections.map(key=>[key,data[key].length]));
}
async function migrate({dryRun=false}={}){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
 const data=readData();const counts=validateData(data);const schema=fs.readFileSync(schemaPath,'utf8');
 const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:process.env.PGSSL_REJECT_UNAUTHORIZED!=='false'}});
 await client.connect();
 try{
  await client.query('BEGIN');
  await client.query(schema);
  await client.query('CREATE TABLE IF NOT EXISTS botforge_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done=await client.query('SELECT name FROM botforge_migrations WHERE name=$1',['json_to_postgres_v1']);
  if(done.rowCount){await client.query('ROLLBACK');console.log('Migration already applied; no rows changed.');return {alreadyApplied:true,counts};}
  for(const u of data.users)await client.query('INSERT INTO users(id,email,name,password_hash,created_at) VALUES($1,$2,$3,$4,$5)',[u.id,u.email.trim().toLowerCase(),u.name,u.passwordHash,validDate(u.createdAt,'user.createdAt')]);
  for(const b of data.bots)await client.query('INSERT INTO bots(id,owner_id,name,description,instructions,provider,model,is_public,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[b.id,b.ownerId,b.name,b.description||'',b.instructions,b.provider||'anthropic',b.model||null,!!b.isPublic,validDate(b.createdAt,'bot.createdAt')]);
  const conversationIds=new Map();
  for(const m of data.messages){
   const key=m.botId+':'+m.userId;
   if(!conversationIds.has(key)){
    const id=crypto.randomUUID();
    const result=await client.query('INSERT INTO conversations(id,bot_id,user_id,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(bot_id,user_id) DO UPDATE SET bot_id=EXCLUDED.bot_id RETURNING id',[id,m.botId,m.userId,validDate(m.createdAt,'message.createdAt')]);
    conversationIds.set(key,result.rows[0].id);
   }
   await client.query('INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES($1,$2,$3,$4,$5)',[m.id,conversationIds.get(key),m.role,m.content,validDate(m.createdAt,'message.createdAt')]);
  }
  for(const d of data.documents){
   await client.query('INSERT INTO documents(id,bot_id,filename,status,created_at) VALUES($1,$2,$3,$4,$5)',[d.id,d.botId,d.filename,'ready',validDate(d.createdAt,'document.createdAt')]);
   for(let i=0;i<d.chunks.length;i++){const c=d.chunks[i];await client.query('INSERT INTO document_chunks(id,document_id,chunk_index,content) VALUES($1,$2,$3,$4)',[c.id,d.id,i,c.text]);}
  }
  for(const u of data.usage)await client.query('INSERT INTO usage_events(id,user_id,bot_id,provider,model,input_tokens,output_tokens,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[u.id,u.userId,u.botId||null,u.provider,u.model||'unknown',u.inputTokens||0,u.outputTokens||0,validDate(u.createdAt,'usage.createdAt')]);
  for(const m of data.memory)await client.query('INSERT INTO memory_notes(id,bot_id,user_id,content,created_at) VALUES($1,$2,$3,$4,$5)',[m.id,m.botId,m.userId,m.content,validDate(m.createdAt,'memory.createdAt')]);
  if(dryRun){await client.query('ROLLBACK');console.log('Dry run successful. No database changes committed.',counts);return {dryRun:true,counts};}
  await client.query('INSERT INTO botforge_migrations(name) VALUES($1)',['json_to_postgres_v1']);
  await client.query('COMMIT');console.log('Migration completed:',counts);return {migrated:true,counts};
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{await client.end();}
}
if(require.main===module){
 const dryRun=process.argv.includes('--dry-run');
 migrate({dryRun}).catch(error=>{console.error('Migration failed:',error.message);process.exitCode=1;});
}
module.exports={readData,validateData,migrate};
