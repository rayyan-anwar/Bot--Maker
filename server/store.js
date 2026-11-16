// JSON-file persistence for local development only. Production must use PostgreSQL.
const fs=require('fs');
const path=require('path');
const DB_PATH=process.env.BOTFORGE_DATA_FILE || path.join(__dirname,'..','data','db.json');
function emptyDB(){return {users:[],bots:[],documents:[],messages:[],usage:[],memory:[]};}
let cache=null;
function load(){
 if(cache)return cache;
 if(!fs.existsSync(DB_PATH)){cache=emptyDB();persist();return cache;}
 try{
  cache=JSON.parse(fs.readFileSync(DB_PATH,'utf8'));
  for(const key of Object.keys(emptyDB()))if(!Array.isArray(cache[key]))cache[key]=[];
 }catch(err){
  // Do not silently reset and overwrite user data if the JSON is damaged.
  throw new Error('Database file is unreadable; restore from backup before restarting: '+err.message);
 }
 return cache;
}
function persist(){
 fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
 const temp=DB_PATH+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(cache,null,2),{mode:0o600});
 fs.renameSync(temp,DB_PATH);
}
function all(collection){const rows=load()[collection];if(!Array.isArray(rows))throw new Error('Unknown data collection: '+collection);return rows;}
function insert(collection,record){const db=load();if(!Array.isArray(db[collection]))throw new Error('Unknown data collection: '+collection);db[collection].push(record);persist();return record;}
function findById(collection,id){return all(collection).find(row=>row.id===id);}
function updateById(collection,id,patch){const db=load();const idx=db[collection].findIndex(row=>row.id===id);if(idx===-1)return null;db[collection][idx]={...db[collection][idx],...patch};persist();return db[collection][idx];}
function deleteById(collection,id){const db=load();const before=db[collection].length;db[collection]=db[collection].filter(row=>row.id!==id);persist();return db[collection].length<before;}
module.exports={load,persist,all,insert,findById,updateById,deleteById};
