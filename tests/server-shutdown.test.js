'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-shutdown-'));
const previous={nodeEnv:process.env.NODE_ENV,jwt:process.env.JWT_SECRET,data:process.env.BOTFORGE_DATA_FILE,timeout:process.env.BOTFORGE_HTTP_SHUTDOWN_TIMEOUT_MS,database:process.env.DATABASE_URL};
process.env.NODE_ENV='test';
process.env.JWT_SECRET='server-shutdown-test-secret-with-at-least-thirty-two-characters';
process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
process.env.BOTFORGE_HTTP_SHUTDOWN_TIMEOUT_MS='100';
delete process.env.DATABASE_URL;

const {start,shutdown}=require('../server/index');
let server;

test.after(async()=>{
 if(server)await shutdown();
 fs.rmSync(dir,{recursive:true,force:true});
 if(previous.nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.nodeEnv;
 if(previous.jwt===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous.jwt;
 if(previous.data===undefined)delete process.env.BOTFORGE_DATA_FILE;else process.env.BOTFORGE_DATA_FILE=previous.data;
 if(previous.timeout===undefined)delete process.env.BOTFORGE_HTTP_SHUTDOWN_TIMEOUT_MS;else process.env.BOTFORGE_HTTP_SHUTDOWN_TIMEOUT_MS=previous.timeout;
 if(previous.database===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous.database;
});

test('shutdown force-closes an HTTP connection that does not finish within the grace period',async()=>{
 server=await start(0,'127.0.0.1');
 const socket=net.connect(server.address().port,'127.0.0.1');
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 socket.write('GET /healthz HTTP/1.1\r\nHost: localhost\r\n');
 const began=Date.now();
 await shutdown();
 server=null;
 assert.ok(Date.now()-began<1500,'shutdown should respect its bounded HTTP grace period');
 assert.equal(socket.destroyed,true);
});
