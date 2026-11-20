const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
async function main(){
 if(!process.env.BOTFORGE_TEST_DATABASE_URL)throw new Error('BOTFORGE_TEST_DATABASE_URL is required.');
 const client=new Client({connectionString:process.env.BOTFORGE_TEST_DATABASE_URL});
 await client.connect();
 try{
  for(const name of ['001_initial_schema.sql','002_runtime_records.sql','003_oauth_and_profile_memory.sql','004_ai_budget_ledger.sql','005_atomic_budget_reserve.sql','006_ai_budget_settlement_release.sql','007_ai_budget_reconciliation.sql']){
   const sql=fs.readFileSync(path.join(__dirname,'..','migrations',name),'utf8');
   await client.query(sql);
  }
  process.stdout.write('PostgreSQL test migrations applied.\\n');
 }finally{await client.end();}
}
main().catch(error=>{process.stderr.write('Test migration failed: '+error.message+'\\n');process.exitCode=1;});
