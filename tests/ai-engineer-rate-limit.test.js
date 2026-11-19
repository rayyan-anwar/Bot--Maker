const test=require('node:test');
const assert=require('node:assert/strict');
const {PostgresRateLimitStore}=require('../server/rate-limit-store');

test('PostgreSQL rate-limit store uses an atomic upsert and scoped expiry cleanup',async()=>{
 const calls=[];
 const fakeQuery=async(sql,values)=>{calls.push({sql,values});return sql.startsWith('INSERT')?{rows:[{hits:4,expires_at:'2026-11-17T12:01:00.000Z'}]}:{rows:[]};};
 const store=new PostgresRateLimitStore('api',fakeQuery);
 await store.init({windowMs:60000});
 const result=await store.increment('client-ip');
 assert.equal(result.totalHits,4);
 assert.ok(result.resetTime instanceof Date);
 assert.match(calls[0].sql,/DELETE FROM botforge_rate_limits WHERE expires_at<=now\(\)/);
 assert.deepEqual(calls[0].values,['api:%']);
 assert.match(calls[1].sql,/ON CONFLICT\(rate_key\) DO UPDATE/);
 assert.match(calls[1].sql,/RETURNING hits,expires_at/);
 assert.deepEqual(calls[1].values,['api:client-ip',60000]);
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


test('AI Engineer write limit can be shared by multiple app instances',async()=>{
 const rows=new Map();
 const fakeQuery=async(sql,values)=>{
  if(sql.startsWith('DELETE FROM botforge_rate_limits'))return {rows:[]};
  if(sql.startsWith('INSERT INTO botforge_rate_limits')){
   const [key,windowMs]=values;
   const current=rows.get(key);
   const now=Date.now();
   const active=current&&current.expiresAt>now;
   const next={hits:active?current.hits+1:1,expiresAt:active?current.expiresAt:now+windowMs};
   rows.set(key,next);
   return {rows:[{hits:next.hits,expires_at:new Date(next.expiresAt).toISOString()}]};
  }
  throw new Error('Unexpected SQL: '+sql);
 };
 const firstInstance=new PostgresRateLimitStore('ai-engineer-write',fakeQuery);
 const secondInstance=new PostgresRateLimitStore('ai-engineer-write',fakeQuery);
 await Promise.all([firstInstance.init({windowMs:60000}),secondInstance.init({windowMs:60000})]);
 assert.equal((await firstInstance.increment('admin-user')).totalHits,1);
 assert.equal((await secondInstance.increment('admin-user')).totalHits,2);
 assert.equal((await firstInstance.increment('admin-user')).totalHits,3);
 assert.equal(rows.size,1);
});

test('AI Engineer write limiter uses PostgreSQL shared storage when configured',()=>{
 const fs=require('node:fs');
 const source=fs.readFileSync(require.resolve('../server/admin.js'),'utf8');
 assert.match(source,/new PostgresRateLimitStore\('ai-engineer-write',store\.query\)/);
 assert.match(source,/store\.isPostgres\(\)/);
});
