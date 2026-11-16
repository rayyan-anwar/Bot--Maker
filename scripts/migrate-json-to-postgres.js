#!/usr/bin/env node
// One-time, transactional migration from BotForge's local JSON store to PostgreSQL.
// Run with DATABASE_URL set and a verified backup of the JSON file.
require('dotenv').config();
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');

const dataPath=process.env.BOTFORGE_DATA_FILE||path.join(__dirname,'..','data','db.json');
const schemaPath=path.join(__dirname,'..','migrations','001_initial_schema.sql');
const required=['users','bots','documents','messages','usage','memory'];
function readData(){
 if(!fs.existsSync(dataPath))throw new Error('JSON data file not found: '+dataPath);
 const data=JSON.parse(fs.readFileSync(dataPath,'utf8'));
 for(const key of required)if(!Array.isArray(data[key]))data[key]=[];
 return data;
}
function iso(value){return value?new Date(value):new Date();}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
 const data=readData();
 const schema=fs.readFileSync(schemaPath,'utf8');
 const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:process.env.PGSSL_REJECT_UNAUTHORIZED!=='false'}});
 await client.connect();
 try{
  await client.query('BEGIN');
  await client.query(schema);
  await client.query('CREATE TABLE IF NOT EXISTS botforge_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done=await client.query('SELECT name FROM botforge_migrations WHERE name=$1',['json_to_postgres_v1']);
  if(done.rowCount){await client.query('ROLLBACK');console.log('Migration already applied; no rows changed.');return;}
  for(const u of data.users){
   await client.query('INSERT INTO users(id,email,name,password_hash,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,password_hash=EXCLUDED.password_hash',[u.id,u.email,u.name,u.passwordHash,iso(u.createdAt)]);
  }
  for(const b of data.bots){
   await client.query('INSERT INTO bots(id,owner_id,name,description,instructions,provider,model,is_public,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,instructions=EXCLUDED.instructions,provider=EXCLUDED.provider,model=EXCLUDED.model,is_public=EXCLUDED.is_public',[b.id,b.ownerId,b.name,b.description||'',b.instructions||'',b.provider||'anthropic',b.model||null,!!b.isPublic,iso(b.createdAt)]);
  }
  const conversationIds=new Map();
  for(const m of data.messages){
   const key=m.botId+':'+m.userId;
   if(!conversationIds.has(key)){
    const id=require('crypto').randomUUID();conversationIds.set(key,id);
    await client.query('INSERT INTO conversations(id,bot_id,user_id,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(bot_id,user_id) DO NOTHING',[id,m.botId,m.userId,iso(m.createdAt)]);
    const existing=await client.query('SELECT id FROM conversations WHERE bot_id=$1 AND user_id=$2',[m.botId,m.userId]);
    conversationIds.set(key,existing.rows[0].id);
   }
   await client.query('INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[m.id,conversationIds.get(key),m.role,m.content,iso(m.createdAt)]);
  }
  for(const d of data.documents){
   await client.query('INSERT INTO documents(id,bot_id,filename,status,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET filename=EXCLUDED.filename',[d.id,d.botId,d.filename,'ready',iso(d.createdAt)]);
   for(let i=0;i<(d.chunks||[]).length;i++){
    const c=d.chunks[i];
    await client.query('INSERT INTO document_chunks(id,document_id,chunk_index,content) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[c.id,d.id,i,c.text]);
   }
  }
  for(const u of data.usage){
   await client.query('INSERT INTO usage_events(id,user_id,bot_id,provider,model,input_tokens,output_tokens,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING',[u.id,u.userId,u.botId,u.provider,u.model||'unknown',u.inputTokens||0,u.outputTokens||0,iso(u.createdAt)]);
  }
  for(const m of data.memory){
   await client.query('INSERT INTO memory_notes(id,bot_id,user_id,content,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[m.id,m.botId,m.userId,m.content,iso(m.createdAt)]);
  }
  await client.query('INSERT INTO botforge_migrations(name) VALUES($1)',['json_to_postgres_v1']);
  await client.query('COMMIT');
  console.log('Migration completed:',{users:data.users.length,bots:data.bots.length,messages:data.messages.length,documents:data.documents.length,usageEvents:data.usage.length,memoryNotes:data.memory.length});
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{await client.end();}
}
main().catch(error=>{console.error('Migration failed:',error.message);process.exitCode=1;});
