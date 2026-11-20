const crypto=require('node:crypto');
const store=require('./store');
const {isAllowedEngineerPath}=require('./engineer-path');
const CONTROL_ID='11111111-1111-4111-8111-111111111111';
const MAX_AUDIT_ROWS=1000;

async function isEnabled(){
 const control=await store.findByIdAsync('settings',CONTROL_ID);
 if(control&&typeof control.aiEngineerEnabled==='boolean')return control.aiEngineerEnabled;
 return process.env.BOTFORGE_AI_ENGINEER_ENABLED==='true';
}

async function setEnabled(enabled,actorId){
 if(typeof enabled!=='boolean')throw new TypeError('AI Engineer enabled state must be boolean.');
 const existing=await store.findByIdAsync('settings',CONTROL_ID);
 const patch={aiEngineerEnabled:enabled,updatedAt:new Date().toISOString(),updatedBy:typeof actorId==='string'?actorId:null};
 if(existing)return store.updateByIdAsync('settings',CONTROL_ID,patch);
 return store.insertAsync('settings',{id:CONTROL_ID,...patch});
}

function safeRoute(value){
 const route=String(value||'').slice(0,100);
 return /^\/engineer\/[a-z-]+$/.test(route)?route:'/engineer/unknown';
}

async function appendAudit({actorId,method,route,statusCode,repository,filePath}){
 const event={
  id:crypto.randomUUID(),
  actorId:typeof actorId==='string'?actorId.slice(0,80):null,
  method:['GET','POST','PUT','PATCH','DELETE'].includes(method)?method:'OTHER',
  route:safeRoute(route),
  statusCode:Number.isInteger(statusCode)?statusCode:0,
  repository:typeof repository==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)?repository:null,
  filePath:isAllowedEngineerPath(filePath)?filePath:null,
  createdAt:new Date().toISOString()
 };
 await store.insertAsync('aiEngineerRuns',event);
 const rows=await store.allAsync('aiEngineerRuns');
 if(rows.length>MAX_AUDIT_ROWS){
  const stale=rows.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).slice(0,rows.length-MAX_AUDIT_ROWS);
  for(const item of stale)await store.deleteByIdAsync('aiEngineerRuns',item.id);
 }
 return event;
}

async function listAudit(limit=100){
 const safeLimit=Math.max(1,Math.min(100,Number.isInteger(limit)?limit:100));
 return (await store.allAsync('aiEngineerRuns')).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,safeLimit);
}

module.exports={isEnabled,setEnabled,appendAudit,listAudit,MAX_AUDIT_ROWS};
