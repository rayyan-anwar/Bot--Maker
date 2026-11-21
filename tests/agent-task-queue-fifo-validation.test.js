
test('completion rejects non-JSON results with a bounded validation error',()=>{
 const q=queue();q.enqueue(task('a'),0);q.claim('worker',1);
 const cyclic={};cyclic.self=cyclic;
 assert.throws(()=>q.complete('a','worker',cyclic,2),/serializable/);
 assert.throws(()=>q.complete('a','worker',1n,2),/serializable/);
 assert.throws(()=>q.complete('a','worker',undefined,2),/serializable/);
});
