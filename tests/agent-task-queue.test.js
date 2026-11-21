'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentTaskQueue } = require('../server/agent-task-queue');

function queue(options) { return new AgentTaskQueue({ leaseMs: 1000, ...options }); }
function task(id, extra = {}) { return { id, ownerId: 'user-1', kind: 'agent-step', payload: { step: id }, ...extra }; }

test('queue validates bounds and payload serialization', () => {
 assert.throws(()=>queue({maxSize:0}),/maxSize/);
 assert.throws(()=>queue({leaseMs:500}),/leaseMs/);
 assert.throws(()=>queue({maxAttempts:0}),/maxAttempts/);
 const q=queue();
 assert.throws(()=>q.enqueue(task('bad',{payload:undefined})),/payload/);
 const cyclic={};cyclic.self=cyclic;
 assert.throws(()=>q.enqueue(task('cyclic',{payload:cyclic})),/serializable/);
});

test('enqueue supports idempotency scoped to owner and bounded queue capacity', () => {
 const q=queue({maxSize:1});
 const first=q.enqueue(task('t1',{idempotencyKey:'key'}),10);
 const repeat=q.enqueue(task('t2',{idempotencyKey:'key'}),11);
 assert.equal(first.id,repeat.id);
 assert.equal(q.enqueue(task('t2'),12).status,'queued');
 assert.throws(()=>q.enqueue(task('t3'),13),/capacity/);
});

test('claim is FIFO, increments attempts and sets lease; heartbeat extends lease',()=>{
 const q=queue();
 q.enqueue(task('a'),100);q.enqueue(task('b'),100);
 const a=q.claim('worker-1',100);
 assert.equal(a.id,'a');assert.equal(a.status,'running');assert.equal(a.attempt,1);assert.equal(a.leaseExpiresAt,1100);
 const hb=q.heartbeat('a','worker-1',200);
 assert.equal(hb.leaseExpiresAt,1200);
 assert.equal(q.claim('worker-2',200).id,'b');
});

test('lease ownership gates completion and failure',()=>{
 const q=queue();
 q.enqueue(task('a'),1);
 q.claim('worker-a',2);
 assert.equal(q.complete('a','worker-b',{ok:true},3),null);
 assert.equal(q.fail('a','worker-b','err',3),null);
 assert.equal(q.complete('a','worker-a',{ok:true},4).status,'completed');
 assert.equal(q.complete('a','worker-a',{ok:true},5),null);
});

test('fail retries with delay then reaches terminal failure',()=>{
 const q=queue({maxAttempts:2});
 q.enqueue(task('a'),0);
 q.claim('w',1);
 assert.equal(q.fail('a','w','temporary',2,500).status,'queued');
 assert.equal(q.claim('w',100),null);
 assert.equal(q.claim('w',502).attempt,2);
 assert.equal(q.fail('a','w','fatal',503,0).status,'failed');
});

test('expired leases recover and fail at attempt limit',()=>{
 const q=queue({maxAttempts:1});
 q.enqueue(task('a'),0);q.claim('worker',1);
 assert.deepEqual(q.recoverExpired(1002),[{id:'a',status:'failed'}]);
 assert.equal(q.get('a','user-1').status,'failed');
});

test('cancel is owner-scoped and terminal tasks cannot be cancelled',()=>{
 const q=queue();q.enqueue(task('a'),0);
 assert.equal(q.cancel('a','other',1),null);
 assert.equal(q.cancel('a','user-1',2).status,'cancelled');
 assert.equal(q.cancel('a','user-1',3),null);
});

test('task results and payloads are bounded and snapshots are isolated',()=>{
 const q=queue();q.enqueue(task('a'),0);
 const snapshot=q.get('a','user-1');snapshot.payload.step='changed';
 assert.equal(q.get('a','user-1').payload.step,'a');
 assert.throws(()=>q.enqueue(task('big',{payload:{data:'x'.repeat(33000)}})),/32 KB/);
 q.claim('w',1);
 assert.throws(()=>q.complete('a','w',{data:'x'.repeat(33000)},2),/32 KB/);
});

test('timestamps and worker identifiers are validated',()=>{
 const q=queue();
 assert.throws(()=>q.enqueue(task('a'),NaN),/timestamp/);
 q.enqueue(task('a'),0);
 assert.throws(()=>q.claim(''),/workerId/);
});
