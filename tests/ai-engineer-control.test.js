const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('AI Engineer kill switch persists across control reads and can be re-enabled',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-engineer-control-'));
 const previousFile=process.env.BOTFORGE_DATA_FILE,previousUrl=process.env.DATABASE_URL,previousFlag=process.env.BOTFORGE_AI_ENGINEER_ENABLED;
 delete process.env.DATABASE_URL;
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 delete process.env.BOTFORGE_AI_ENGINEER_ENABLED;
 const storePath=require.resolve('../server/store'),controlPath=require.resolve('../server/engineer-control');
 delete require.cache[controlPath];delete require.cache[storePath];
 const store=require('../server/store'),control=require('../server/engineer-control');
 try{
  assert.equal(await control.isEnabled(),false);
  process.env.BOTFORGE_AI_ENGINEER_ENABLED='true';
  assert.equal(await control.isEnabled(),true);
  delete process.env.BOTFORGE_AI_ENGINEER_ENABLED;
  const disabled=await control.setEnabled(false,'admin-user');
  assert.equal(disabled.aiEngineerEnabled,false);
  assert.equal(await control.isEnabled(),false);
  assert.equal((await store.findByIdAsync('settings','11111111-1111-4111-8111-111111111111')).updatedBy,'admin-user');
  await control.setEnabled(true,'admin-user');
  assert.equal(await control.isEnabled(),true);
 }finally{
  await store.close();
  delete require.cache[controlPath];delete require.cache[storePath];
  if(previousFile===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=previousFile;
  if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  if(previousFlag===undefined)delete process.env.BOTFORGE_AI_ENGINEER_ENABLED;else process.env.BOTFORGE_AI_ENGINEER_ENABLED=previousFlag;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('AI Engineer audit stores bounded operational metadata without prompt or credential fields',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-engineer-audit-'));
 const previousFile=process.env.BOTFORGE_DATA_FILE,previousUrl=process.env.DATABASE_URL;
 delete process.env.DATABASE_URL;
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const storePath=require.resolve('../server/store'),controlPath=require.resolve('../server/engineer-control');
 delete require.cache[controlPath];delete require.cache[storePath];
 const store=require('../server/store'),control=require('../server/engineer-control');
 try{
  await control.appendAudit({actorId:'admin-user',method:'POST',route:'/engineer/propose-fix',statusCode:200,repository:'owner/repo',filePath:'server/auth.js',task:'DO NOT STORE THIS',apiKey:'DO NOT STORE THIS'});
  await store.insertAsync('aiEngineerRuns',{id:'task-run',kind:'agent-task',status:'completed',createdAt:new Date().toISOString(),privateTaskResult:'internal task data'});
  const [event]=await control.listAudit(10);
  assert.equal(event.actorId,'admin-user');
  assert.equal(event.repository,'owner/repo');
  assert.equal(event.filePath,'server/auth.js');
  assert.equal(event.statusCode,200);
  assert.equal(JSON.stringify(event).includes('DO NOT STORE THIS'),false);
  assert.equal(JSON.stringify(event).includes('apiKey'),false);
  assert.equal((await store.allAsync('aiEngineerRuns')).length,2);
  assert.equal((await control.listAudit(10)).length,1);
 }finally{
  await store.close();
  delete require.cache[controlPath];delete require.cache[storePath];
  if(previousFile===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=previousFile;
  if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('AI Engineer approval can be claimed once and replay returns the same completed result',async()=>{
 const crypto=require('node:crypto');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-engineer-approval-'));
 const previousFile=process.env.BOTFORGE_DATA_FILE,previousUrl=process.env.DATABASE_URL;
 delete process.env.DATABASE_URL;
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const storePath=require.resolve('../server/store');
 delete require.cache[storePath];
 const store=require('../server/store');
 try{
  const id=crypto.randomUUID(),expiresAt=new Date(Date.now()+60000).toISOString();
  await store.insertAsync('aiEngineerApprovals',{id,actorId:'admin-one',repository:'owner/repo',filePath:'server/auth.js',baseSha:'a'.repeat(40),contentHash:'b'.repeat(64),taskHash:'c'.repeat(64),status:'pending',createdAt:new Date().toISOString(),expiresAt,attempts:0});
  assert.equal((await store.claimEngineerApproval(id,'different-admin')).state,'invalid');
  const first=await store.claimEngineerApproval(id,'admin-one');
  assert.equal(first.state,'claimed');
  assert.equal(first.approval.status,'creating');
  assert.equal((await store.claimEngineerApproval(id,'admin-one')).state,'in_progress');
  await store.updateEngineerApproval(id,'admin-one',{status:'created',leaseUntil:null,branch:'botforge-ai-fix/'+id,pullRequestNumber:42,url:'https://github.com/owner/repo/pull/42'});
  const replay=await store.claimEngineerApproval(id,'admin-one');
  assert.equal(replay.state,'created');
  assert.equal(replay.approval.pullRequestNumber,42);
  assert.equal(replay.approval.url,'https://github.com/owner/repo/pull/42');
 }finally{
  await store.close();
  delete require.cache[storePath];
  if(previousFile===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=previousFile;
  if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('expired AI Engineer proposals cannot be claimed',async()=>{
 const crypto=require('node:crypto');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-engineer-expired-'));
 const previousFile=process.env.BOTFORGE_DATA_FILE,previousUrl=process.env.DATABASE_URL;
 delete process.env.DATABASE_URL;
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const storePath=require.resolve('../server/store');
 delete require.cache[storePath];
 const store=require('../server/store');
 try{
  const id=crypto.randomUUID();
  await store.insertAsync('aiEngineerApprovals',{id,actorId:'admin-one',status:'pending',expiresAt:new Date(Date.now()-1000).toISOString()});
  assert.equal((await store.claimEngineerApproval(id,'admin-one')).state,'expired');
 }finally{
  await store.close();
  delete require.cache[storePath];
  if(previousFile===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=previousFile;
  if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});


test('AI Engineer audit accepts only canonical repository paths',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-engineer-path-audit-'));
 const previousFile=process.env.BOTFORGE_DATA_FILE,previousUrl=process.env.DATABASE_URL;
 delete process.env.DATABASE_URL;process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const storePath=require.resolve('../server/store'),controlPath=require.resolve('../server/engineer-control');
 delete require.cache[controlPath];delete require.cache[storePath];
 const store=require('../server/store'),control=require('../server/engineer-control');
 try{
  for(const filePath of ['server/auth.js','tests/auth.test.js'])await control.appendAudit({actorId:'admin',method:'POST',route:'/engineer/propose-fix',statusCode:200,filePath});
  for(const filePath of ['server/../secrets.js','server\\\\auth.js','server/%2e%2e/secrets.js','public/app.js','server/notes.ts'])await control.appendAudit({actorId:'admin',method:'POST',route:'/engineer/propose-fix',statusCode:200,filePath});
  const rows=await control.listAudit(20);
  assert.equal(rows.filter(row=>row.filePath!==null).length,2);
  assert.deepEqual(rows.filter(row=>row.filePath).map(row=>row.filePath).sort(),['server/auth.js','tests/auth.test.js']);
 }finally{
  await store.close();delete require.cache[controlPath];delete require.cache[storePath];
  if(previousFile===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=previousFile;
  if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
