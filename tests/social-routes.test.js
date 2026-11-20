const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-social-routes-'));
process.env.NODE_ENV='test';
process.env.JWT_SECRET='social-route-test-secret-with-at-least-thirty-two-characters';
process.env.BOTFORGE_ADMIN_EMAIL='social-owner@example.test';
process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
delete process.env.DATABASE_URL;
const {start,shutdown}=require('../server/index');
process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY=require('node:crypto').randomBytes(32).toString('base64');
const store=require('../server/store');
const social=require('../server/social-intelligence');
const bcrypt=require('bcryptjs');
const {v4:uuidv4}=require('uuid');
let server,base,cookie;
test.before(async()=>{
 server=await start(0,'127.0.0.1');base='http://127.0.0.1:'+server.address().port;
 await store.insertAsync('users',{id:uuidv4(),email:'social-owner@example.test',name:'Social owner',passwordHash:await bcrypt.hash('social-owner-password-123',10),createdAt:new Date().toISOString()});
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'social-owner@example.test',password:'social-owner-password-123'})});
 assert.equal(response.status,200);cookie=(response.headers.get('set-cookie')||'').split(';')[0];
});
test.after(async()=>{if(server)await shutdown();fs.rmSync(dir,{recursive:true,force:true});});

test('Social Intelligence APIs require authentication',async()=>{
 const response=await fetch(base+'/api/social/platforms');
 assert.equal(response.status,401);
});

test('authenticated user can list safe platform capabilities and create a PKCE state',async()=>{
 const platforms=await fetch(base+'/api/social/platforms',{headers:{cookie}});
 assert.equal(platforms.status,200);
 const rows=(await platforms.json()).platforms;
 assert.deepEqual(rows.map(row=>row.id),['instagram','youtube','linkedin']);
 assert.ok(rows.every(row=>row.liveOAuthAvailable===false&&row.publishingAvailable===false));
 const created=await fetch(base+'/api/social/instagram/oauth/state',{method:'POST',headers:{cookie}});
 assert.equal(created.status,201);
 const body=await created.json();
 assert.equal(body.platform,'instagram');
 assert.equal(body.codeChallengeMethod,'S256');
 assert.equal(body.authorizationUrlAvailable,false);
 const records=await store.findManyAsync('socialOAuthStates');
 assert.equal(records.length,1);
 assert.notEqual(records[0].stateHash,body.state);
 assert.equal(records[0].codeVerifier.length>30,true);
});

test('unsupported platform cannot create an OAuth state',async()=>{
 const response=await fetch(base+'/api/social/unknown/oauth/state',{method:'POST',headers:{cookie}});
 assert.equal(response.status,404);
});


test('social connection listing and disconnect are scoped to the authenticated account',async()=>{
 const user=(await store.findManyAsync('users',{email:'social-owner@example.test'}))[0];
 const connection=await social.connectAccount({userId:user.id,platform:'linkedin',platformAccountId:'org-42',displayName:'Example organization',scopes:['organization.read'],accessToken:'integration-secret-token'});
 const listed=await fetch(base+'/api/social/connections',{headers:{cookie}});
 assert.equal(listed.status,200);
 assert.equal((await listed.json()).connections[0].id,connection.id);
 const denied=await fetch(base+'/api/social/connections/'+uuidv4(),{method:'DELETE',headers:{cookie}});
 assert.equal(denied.status,404);
 const removed=await fetch(base+'/api/social/connections/'+connection.id,{method:'DELETE',headers:{cookie}});
 assert.equal(removed.status,200);
 assert.equal((await removed.json()).ok,true);
 assert.deepEqual(await social.listConnections(user.id),[]);
});
