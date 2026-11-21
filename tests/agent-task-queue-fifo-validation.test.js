'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentTaskQueue } = require('../server/agent-task-queue');

const qmake=()=>new AgentTaskQueue({leaseMs:1000});
const task=id=>({id,ownerId:'owner',kind:'agent-step',payload:{id}});

test('queue claims same-time tasks in insertion order rather than lexical id order',()=>{
 const q=qmake();
 q.enqueue(task('z-first'),100);
 q.enqueue(task('a-second'),100);
 assert.equal(q.claim('worker',100).id,'z-first');
 assert.equal(q.claim('worker',100).id,'a-second');
});

test('queue completion converts invalid result serialization into a bounded error',()=>{
 const q=qmake();q.enqueue(task('task'),0);q.claim('worker',1);
 const circular={};circular.self=circular;
 assert.throws(()=>q.complete('task','worker',circular,2),/serializable/);
 assert.throws(()=>q.complete('task','worker',3n,2),/serializable/);
 assert.throws(()=>q.complete('task','worker',undefined,2),/serializable/);
});
