'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {v4:uuidv4}=require('uuid');

test('bot creation and concurrent edits keep bot state and version history atomic',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-bot-atomicity-'));
 const prior={data:process.env.BOTFORGE_DATA_FILE,database:process.env.DATABASE_URL};
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 delete process.env.DATABASE_URL;
 const store=require('../server/store');
 try{
  const ownerId=uuidv4(),botId=uuidv4(),createdAt=new Date().toISOString();
  const bot={id:botId,ownerId,name:'Original',instructions:'Original instructions',provider:'anthropic',isPublic:false,version:1,createdAt,updatedAt:createdAt};
  const initialVersion={id:uuidv4(),botId,ownerId,version:1,snapshot:{name:'Original'},createdAt};
  await store.createBotWithVersion(bot,initialVersion);
  assert.equal((await store.findByIdAsync('bots',botId)).version,1);
  assert.deepEqual((await store.findManyAsync('botVersions',{botId,ownerId})).map(v=>v.version),[1]);

  const timestamp=new Date(Date.now()+1).toISOString();
  const makeUpdate=(name)=>store.updateBotVersioned({
   botId,ownerId,expectedVersion:1,
   patch:{name,version:2,updatedAt:timestamp},
   versionRecord:{id:uuidv4(),botId,ownerId,version:2,snapshot:{name},createdAt:timestamp}
  });
  const results=await Promise.all([makeUpdate('Concurrent A'),makeUpdate('Concurrent B')]);
  assert.equal(results.filter(result=>result.state==='updated').length,1);
  assert.equal(results.filter(result=>result.state==='conflict').length,1);
  const finalBot=await store.findByIdAsync('bots',botId);
  const history=await store.findManyAsync('botVersions',{botId,ownerId});
  assert.equal(finalBot.version,2);
  assert.ok(['Concurrent A','Concurrent B'].includes(finalBot.name));
  assert.deepEqual(history.map(v=>v.version).sort((a,b)=>a-b),[1,2]);
 }finally{
  await store.close();
  if(prior.data===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=prior.data;
  if(prior.database===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=prior.database;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
