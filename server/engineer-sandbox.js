'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');

const MAX_SOURCE_BYTES=30000;
const DEFAULT_TIMEOUT_MS=10000;
const DEFAULT_IMAGE='node:22-alpine';

function sandboxImage(value){
 const image=String(value||DEFAULT_IMAGE).trim();
 if(!/^(node:22-alpine|node:22-alpine@sha256:[a-f0-9]{64})$/.test(image))throw new Error('AI Engineer sandbox image must be node:22-alpine or its immutable sha256 digest.');
 return image;
}

function dockerArgs(workspace,image,containerName){
 return [
  'run','--rm','--name',containerName,'--pull=never','--network=none','--read-only',
  '--memory=128m','--memory-swap=128m','--cpus=0.50','--pids-limit=32',
  '--ulimit','nofile=64:64','--cap-drop=ALL','--security-opt=no-new-privileges',
  '--user=65534:65534','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m',
  '--mount','type=bind,src='+workspace+',dst=/workspace,readonly',
  '--workdir','/workspace',image,'node','--check','/workspace/proposal.js'
 ];
}

function dockerEnvironment(source){
 const env={};
 for(const key of ['PATH','HOME','DOCKER_HOST']){
  if(source[key])env[key]=source[key];
 }
 return env;
}

async function validateJavaScriptInSandbox(source,options={}){
 if(typeof source!=='string'||!source.trim())throw new TypeError('A non-empty JavaScript source string is required.');
 if(Buffer.byteLength(source,'utf8')>MAX_SOURCE_BYTES)throw new Error('Proposed JavaScript exceeds the 30 KB sandbox limit.');
 const image=sandboxImage(options.image||process.env.BOTFORGE_ENGINEER_SANDBOX_IMAGE);
 const timeoutMs=Math.max(1000,Math.min(15000,Number(options.timeoutMs)||DEFAULT_TIMEOUT_MS));
 const root=options.tempRoot||os.tmpdir();
 const spawnProcess=options.spawnImpl||spawn;
 const env=dockerEnvironment(options.env||process.env);
 const containerName='botforge-engineer-'+crypto.randomUUID();
 const directory=await fs.mkdtemp(path.join(root,'botforge-engineer-'));
 try{
  await fs.chmod(directory,0o755);
  const file=path.join(directory,'proposal.js');
  await fs.writeFile(file,source,{encoding:'utf8',mode:0o400,flag:'wx'});
  const args=dockerArgs(directory,image,containerName);
  const result=await new Promise((resolve,reject)=>{
   let settled=false;
   const child=spawnProcess('docker',args,{stdio:'ignore',env});
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
   const timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch(_){}try{const cleanup=spawnProcess('docker',['kill',containerName],{stdio:'ignore',env});cleanup.unref?.();}catch(_){}finish(new Error('Isolated patch validation timed out.'));},timeoutMs);
   child.once('error',()=>finish(new Error('Docker sandbox is unavailable. Configure a local Docker daemon and preload the approved Node image.')));
   child.once('close',(code,signal)=>finish(null,{code,signal}));
  });
  if(result.code!==0)throw new Error(result.signal?'Isolated patch validation was terminated.':'Proposed JavaScript failed isolated syntax validation.');
  return {ok:true,validator:'docker-isolated-node-check',image,network:'disabled',readOnlyWorkspace:true,executed:false};
 }finally{
  await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});
 }
}

module.exports={validateJavaScriptInSandbox,dockerArgs,sandboxImage,MAX_SOURCE_BYTES,DEFAULT_TIMEOUT_MS};
