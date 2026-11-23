'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');

process.env.NODE_ENV='test';
process.env.JWT_SECRET='server-shutdown-test-secret-with-at-least-thirty-two-characters';
process.env.BOTFORGE_DATA_FILE=require('node:path').join(require('node:os').tmpdir(),'botforge-shutdown-'+process.pid+'.json');
process.env.BOTFORGE_HTTP_SHUTDOWN_TIMEOUT_MS='100';
delete process.env.DATABASE_URL;

const {start,shutdown}=require('../server/index');

test('shutdown force-closes an HTTP connection that does not finish within the grace period',async()=>{
 const server=await start(0,'127.0.0.1');
 const socket=net.connect(server.address().port,'127.0.0.1');
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 socket.write('GET /healthz HTTP/1.1\\r\\nHost: localhost\\r\\n');
 const began=Date.now();
 await shutdown();
 assert.ok(Date.now()-began<1500,'shutdown should respect its bounded HTTP grace period');
 assert.equal(socket.destroyed,true);
});
