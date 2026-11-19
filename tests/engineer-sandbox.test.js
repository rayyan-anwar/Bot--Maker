'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const nodeFs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validateJavaScriptInSandbox,dockerArgs,sandboxImage,MAX_SOURCE_BYTES}=require('../server/engineer-sandbox');

function fakeSpawn(code=0){
 const calls=[];
 const spawnImpl=(command,args,options)=>{
  calls.push({command,args,options});
  const mount=args.find(value=>typeof value==='string'&&value.startsWith('type=bind,'));
  if(mount){const source=mount.match(/src=([^,]+)/)[1];assert.equal(nodeFs.statSync(source).mode&0o777,0o755);assert.equal(nodeFs.statSync(path.join(source,'proposal.js')).mode&0o777,0o444);}
  const child=new EventEmitter();
  child.kill=()=>{};
  queueMicrotask(()=>child.emit('close',code,null));
  return child;
 };
 return {spawnImpl,calls};
}

test('sandbox command disables network, locks workspace and limits resources',()=>{
 const args=dockerArgs('/tmp/fixture','node:22-alpine');
 for(const flag of ['--network=none','--read-only','--memory=128m','--memory-swap=128m','--cpus=0.50','--pids-limit=32','--cap-drop=ALL','--security-opt=no-new-privileges'])assert.ok(args.includes(flag),flag);
 assert.ok(args.some(value=>value.includes('readonly')));
 assert.ok(args.includes('--check'));
 assert.ok(args.includes('--name'));
 assert.ok(!args.includes('-e'));
});

test('only the approved Node sandbox image is accepted',()=>{
 assert.equal(sandboxImage('node:22-alpine'),'node:22-alpine');
 assert.throws(()=>sandboxImage('attacker/image:latest'),/must be node:22-alpine/);
});

test('validates through Docker and removes the temporary workspace',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'botforge-sandbox-test-'));
 const {spawnImpl,calls}=fakeSpawn(0);
 try{
  const result=await validateJavaScriptInSandbox('const answer = 42;',{tempRoot:root,spawnImpl,env:{PATH:'/usr/bin'}});
  assert.equal(result.ok,true);
  assert.equal(result.executed,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].command,'docker');
  assert.ok(calls[0].args.includes('--network=none'));
  assert.ok(calls[0].args.includes('--check'));
  assert.deepEqual(await fs.readdir(root),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('fails closed when Docker reports invalid JavaScript',async()=>{
 const {spawnImpl}=fakeSpawn(1);
 await assert.rejects(()=>validateJavaScriptInSandbox('const = ;',{spawnImpl}),/failed isolated syntax validation/);
});

test('fails closed when Docker is unavailable',async()=>{
 const spawnImpl=()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('error',new Error('missing')));return child;};
 await assert.rejects(()=>validateJavaScriptInSandbox('const x=1;',{spawnImpl}),/Docker sandbox is unavailable/);
});

test('rejects empty and oversized source before starting Docker',async()=>{
 const {spawnImpl,calls}=fakeSpawn(0);
 await assert.rejects(()=>validateJavaScriptInSandbox(' ',{spawnImpl}),/non-empty/);
 await assert.rejects(()=>validateJavaScriptInSandbox('x'.repeat(MAX_SOURCE_BYTES+1),{spawnImpl}),/30 KB/);
 assert.equal(calls.length,0);
});
