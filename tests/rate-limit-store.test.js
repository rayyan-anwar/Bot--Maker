const test=require('node:test');
const assert=require('node:assert/strict');
const {PostgresRateLimitStore}=require('../server/rate-limit-store');

test('PostgreSQL rate-limit store uses an atomic upsert and scoped expiry cleanup',async()=>{
 const calls=[];
 const fakeQuery=async(sql,values)=>{calls.push({sql,values});return {rows:[{hits:4,expires_at:'2026-11-17T12:01:00.000Z'}]};};
 const store=new PostgresRateLimitStore('api',fakeQuery);
 await store.init({windowMs:60000});
 const result=await store.increment('client-ip');
 assert.equal(result.totalHits,4);
 assert.ok(result.resetTime instanceof Date);
 assert.match(calls[0].sql,/ON CONFLICT\(rate_key\) DO UPDATE/);
 assert.match(calls[0].sql,/expires_at<=now\(\)/);
 assert.deepEqual(calls[0].values,['api:client-ip',60000,'api:%']);
});

test('PostgreSQL rate-limit store scopes decrement and reset operations',async()=>{
 const calls=[];
 const store=new PostgresRateLimitStore('auth',async(sql,values)=>{calls.push({sql,values});return {rows:[]};});
 await store.decrement('client-ip');
 await store.resetKey('client-ip');
 assert.deepEqual(calls.map(x=>x.values),[['auth:client-ip'],['auth:client-ip']]);
 assert.match(calls[0].sql,/GREATEST\(0,hits-1\)/);
 assert.match(calls[1].sql,/DELETE FROM botforge_rate_limits/);
});

test('PostgreSQL rate-limit store requires a namespace and query adapter',()=>{
 assert.throws(()=>new PostgresRateLimitStore('',async()=>({rows:[]})),/namespace/);
 assert.throws(()=>new PostgresRateLimitStore('api',null),/query function/);
});
