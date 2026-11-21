'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentTaskQueue } = require('../server/agent-task-queue');

function queue(options) { return new AgentTaskQueue({ leaseMs: 1000, ...options }); }
function task(id) { return { id, ownerId: 'user-1', kind: 'agent-step', payload: { step: id } }; }

test('claim preserves enqueue FIFO for matching timestamps, not lexical ids',()=>{
 const q=queue();
 q.enqueue(task('z-first'),100);q.enqueue(task('a-second'),100);
 assert.equal(q.claim('worker',100).id,'z-first');
 assert.equal(q.claim('worker',100).id,'a-second');
});

test('completion rejects non-JSON results with a bounded validation error',()=>{
 const q=queue();q.enqueue(task('a'),0);q.claim('worker',1);
 const cyclic={};cyclic.self=cyclic;
 assert.throws(()=>q.complete('a','worker',cyclic,2),/serializable/);
 assert.throws(()=>q.complete('a','worker',1n,2),/serializable/);
 assert.throws(()=>q.complete('a','worker',undefined,2),/serializable/);
});
