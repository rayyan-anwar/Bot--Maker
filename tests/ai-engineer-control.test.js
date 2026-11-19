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
  assert.equal(await control.isEnabled(),true);
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
  const [event]=await control.listAudit(10);
  assert.equal(event.actorId,'admin-user');
  assert.equal(event.repository,'owner/repo');
  assert.equal(event.filePath,'server/auth.js');
  assert.equal(event.statusCode,200);
  assert.equal(JSON.stringify(event).includes('DO NOT STORE THIS'),false);
  assert.equal(JSON.stringify(event).includes('apiKey'),false);
  assert.equal((await store.allAsync('aiEngineerRuns')).length,1);
 }finally{
  await store.close();
  delete require.cache[controlPath];delete require.cache[storePath];
  if(previousFile===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=previousFile;
  if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
