'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('public bot discovery supports bounded search and pagination without exposing private or owned bots',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-public-discovery-'));
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='public-discovery-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_ADMIN_EMAIL='discovery-owner@example.test';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 for(const [email,name] of [['discovery-owner@example.test','Owner'],['discovery-visitor@example.test','Visitor']]){
  await store.insertAsync('users',{id:uuidv4(),email,name,passwordHash:await bcrypt.hash('discovery-password-123',10),createdAt:new Date().toISOString()});
 }
 async function login(email){
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'discovery-password-123'})});
  assert.equal(response.status,200);
  return (response.headers.get('set-cookie')||'').split(';')[0];
 }
 const owner=await login('discovery-owner@example.test'),visitor=await login('discovery-visitor@example.test');
 async function createBot(name,description,isPublic){
  const response=await fetch(base+'/api/bots',{method:'POST',headers:{cookie:owner,'content-type':'application/json'},body:JSON.stringify({name,description,instructions:'Answer clearly.',isPublic})});
  assert.equal(response.status,201);
  return (await response.json()).bot;
 }
 const alpha=await createBot('Alpha Tutor','Mathematics and science help',true);
 const beta=await createBot('Beta Tutor','Programming lessons',true);
 const gamma=await createBot('Gamma Helper','Private planning assistant',false);
 await store.updateByIdAsync('bots',alpha.id,{createdAt:'2026-01-01T00:00:00.000Z'});
 await store.updateByIdAsync('bots',beta.id,{createdAt:'2026-01-02T00:00:00.000Z'});
 await store.updateByIdAsync('bots',gamma.id,{createdAt:'2026-01-03T00:00:00.000Z'});

 const first=await fetch(base+'/api/bots/public?limit=1&offset=0&q=tutor',{headers:{cookie:visitor}});
 assert.equal(first.status,200);
 const firstPayload=await first.json();
 assert.deepEqual(firstPayload.bots.map(bot=>bot.id),[beta.id]);
 assert.deepEqual(firstPayload.pagination,{limit:1,offset:0,total:2,hasMore:true});

 const second=await fetch(base+'/api/bots/public?limit=1&offset=1&q=tutor',{headers:{cookie:visitor}});
 assert.equal(second.status,200);
 const secondPayload=await second.json();
 assert.deepEqual(secondPayload.bots.map(bot=>bot.id),[alpha.id]);
 assert.equal(secondPayload.pagination.hasMore,false);

 const descriptionSearch=await fetch(base+'/api/bots/public?q=programming',{headers:{cookie:visitor}});
 assert.equal(descriptionSearch.status,200);
 assert.deepEqual((await descriptionSearch.json()).bots.map(bot=>bot.id),[beta.id]);

 const ownerFeed=await fetch(base+'/api/bots/public',{headers:{cookie:owner}});
 assert.deepEqual((await ownerFeed.json()).bots,[]);

 for(const query of ['limit=0','limit=51','offset=-1','offset=100001','q='+('x'.repeat(81))]){
  const invalid=await fetch(base+'/api/bots/public?'+query,{headers:{cookie:visitor}});
  assert.equal(invalid.status,400,query);
 }
});
