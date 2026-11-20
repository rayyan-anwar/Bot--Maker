const test=require('node:test');const assert=require('node:assert/strict');
const metrics=require('../server/metrics');
test('metrics endpoint authorization compares bearer tokens safely',()=>{
 assert.equal(metrics.authorized('Bearer secret','secret'),true);
 assert.equal(metrics.authorized('Bearer wrong','secret'),false);
 assert.equal(metrics.authorized('secret','secret'),false);
 assert.equal(metrics.authorized('Bearer secret',''),false);
});
test('metrics output uses Prometheus text exposition',()=>{
 const output=metrics.render();
 assert.match(output,/botforge_http_requests_total/);
 assert.match(output,/botforge_process_uptime_seconds/);
});


test('metrics expose process memory gauges for production monitoring',()=>{
 const output=metrics.render();
 assert.match(output,/botforge_process_resident_memory_bytes [0-9]+/);
 assert.match(output,/botforge_process_heap_used_bytes [0-9]+/);
 assert.match(output,/botforge_process_heap_total_bytes [0-9]+/);
});
