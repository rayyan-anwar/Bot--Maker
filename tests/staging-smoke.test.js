const test=require('node:test');
const assert=require('node:assert/strict');
const {checkEndpoints}=require('../scripts/staging-smoke');

test('staging smoke checks health and database readiness endpoints',async()=>{
 const calls=[];
 const result=await checkEndpoints('https://staging.example.test',async(url)=>{
  calls.push(new URL(url).pathname);
  return new Response(JSON.stringify({service:'botforge-api',database:{provider:'postgres'}}),{status:200,headers:{'content-type':'application/json'}});
 });
 assert.deepEqual(calls,['/healthz','/readyz']);
 assert.equal(result.ok,true);
 assert.equal(result.results[1].database,'postgres');
});

test('staging smoke fails when readiness is unavailable',async()=>{
 let count=0;
 const result=await checkEndpoints('https://staging.example.test',async()=>{
  count++;return new Response('{}',{status:count===1?200:503});
 });
 assert.equal(result.ok,false);
 assert.equal(result.results[1].status,503);
});

test('staging smoke rejects insecure remote URLs and URL credentials',async()=>{
 await assert.rejects(()=>checkEndpoints('http://staging.example.test'),/HTTPS/);
 await assert.rejects(()=>checkEndpoints('https://user:pass@staging.example.test'),/credentials/);
});
