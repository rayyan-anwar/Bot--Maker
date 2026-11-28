 assert.equal(typeof records[0].codeVerifierEnvelope,'object');
 assert.equal(Object.hasOwn(records[0],'codeVerifier'),false);const test=require('node:test');
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
 assert.equal(typeof records[0].codeVerifierEnvelope,'object');\n assert.equal(Object.hasOwn(records[0],'codeVerifier'),false);
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


test('YouTube OAuth completes a user-bound callback, stores encrypted credentials and refreshes tokens',async()=>{
 process.env.BOTFORGE_YOUTUBE_CLIENT_ID='youtube-test-client';
 process.env.BOTFORGE_YOUTUBE_CLIENT_SECRET='youtube-test-secret';
 process.env.BOTFORGE_YOUTUBE_REDIRECT_URI=base+'/api/social/youtube/oauth/callback';
 const realFetch=global.fetch;
 const providerCalls=[];
 global.fetch=async(url,options={})=>{
  const target=String(url);providerCalls.push({url:target,options});
  if(target==='https://oauth2.googleapis.com/token'){
   const body=String(options.body);
   if(body.includes('grant_type=refresh_token'))return {ok:true,json:async()=>({access_token:'youtube-refreshed-token',expires_in:3600})};
   return {ok:true,json:async()=>({access_token:'youtube-access-token',refresh_token:'youtube-refresh-token',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.readonly'})};
  }
  if(target.startsWith('https://www.googleapis.com/youtube/v3/channels'))return {ok:true,json:async()=>({items:[{id:'channel-123',snippet:{title:'BotForge Channel'}}]})};
  return realFetch(url,options);
 };
 try{
  const stateResponse=await realFetch(base+'/api/social/youtube/oauth/state',{method:'POST',headers:{cookie}});
  assert.equal(stateResponse.status,201);
  const stateBody=await stateResponse.json();
  const authorization=new URL(stateBody.authorizationUrl);
  assert.equal(authorization.origin,'https://accounts.google.com');
  assert.equal(authorization.searchParams.get('response_type'),'code');
  assert.equal(authorization.searchParams.get('access_type'),'offline');
  assert.equal(authorization.searchParams.get('state'),stateBody.state);
  assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
  assert.equal(authorization.searchParams.get('code_challenge'),stateBody.codeChallenge);
  assert.equal(stateBody.authorizationUrlAvailable,true);
  const callback=await realFetch(base+'/api/social/youtube/oauth/callback?code=one-time-code&state='+encodeURIComponent(stateBody.state),{headers:{cookie},redirect:'manual'});
  assert.equal(callback.status,302);
  assert.match(callback.headers.get('location'),/social_connected=youtube/);
  const user=(await store.findManyAsync('users',{email:'social-owner@example.test'}))[0];
  const connections=await social.listConnections(user.id);
  const connection=connections.find(item=>item.platform==='youtube'&&item.platformAccountId==='channel-123');
  assert.ok(connection);
  assert.equal(connection.displayName,'BotForge Channel');
  assert.equal(JSON.stringify(connection).includes('youtube-access-token'),false);
  assert.equal((await social.getConnectionCredentials(user.id,connection.id)).refreshToken,'youtube-refresh-token');
  const refresh=await realFetch(base+'/api/social/connections/'+connection.id+'/refresh',{method:'POST',headers:{cookie}});
  assert.equal(refresh.status,200);
  assert.equal((await social.getConnectionCredentials(user.id,connection.id)).accessToken,'youtube-refreshed-token');
  assert.equal(providerCalls.length,3);
 }finally{
  global.fetch=realFetch;
  delete process.env.BOTFORGE_YOUTUBE_CLIENT_ID;
  delete process.env.BOTFORGE_YOUTUBE_CLIENT_SECRET;
  delete process.env.BOTFORGE_YOUTUBE_REDIRECT_URI;
 }
});

test('social OAuth refuses to start when provider credentials are incomplete',async()=>{
 delete process.env.BOTFORGE_LINKEDIN_CLIENT_ID;
 delete process.env.BOTFORGE_LINKEDIN_CLIENT_SECRET;
 delete process.env.BOTFORGE_LINKEDIN_REDIRECT_URI;
 const response=await fetch(base+'/api/social/linkedin/oauth/state',{method:'POST',headers:{cookie}});
 assert.equal(response.status,503);
});


test('LinkedIn and Instagram OAuth callbacks create account-scoped connections',async()=>{
 const providers={
  linkedin:{id:'BOTFORGE_LINKEDIN',redirect:base+'/api/social/linkedin/oauth/callback'},
  instagram:{id:'BOTFORGE_INSTAGRAM',redirect:base+'/api/social/instagram/oauth/callback'}
 };
 for(const [platform,config] of Object.entries(providers)){
  process.env[config.id+'_CLIENT_ID']=platform+'-client';
  process.env[config.id+'_CLIENT_SECRET']=platform+'-secret';
  process.env[config.id+'_REDIRECT_URI']=config.redirect;
 }
 const realFetch=global.fetch;
 global.fetch=async(url,options={})=>{
  const target=String(url);
  if(target==='https://www.linkedin.com/oauth/v2/accessToken')return {ok:true,json:async()=>({access_token:'linkedin-access-token',expires_in:3600,scope:'openid profile'})};
  if(target==='https://api.linkedin.com/v2/userinfo')return {ok:true,json:async()=>({sub:'linkedin-member-9',name:'LinkedIn Member'})};
  if(target==='https://api.instagram.com/oauth/access_token')return {ok:true,json:async()=>({access_token:'instagram-short-token',user_id:'instagram-user-7',expires_in:3600})};
  if(target.startsWith('https://graph.instagram.com/me'))return {ok:true,json:async()=>({user_id:'instagram-user-7',username:'botforge_demo'})};
  if(target.startsWith('https://graph.instagram.com/access_token'))return {ok:true,json:async()=>({access_token:'instagram-long-token',expires_in:5184000})};
  if(target.startsWith('https://graph.instagram.com/refresh_access_token'))return {ok:true,json:async()=>({access_token:'instagram-refreshed-token',expires_in:5184000})};
  return realFetch(url,options);
 };
 try{
  for(const platform of ['linkedin','instagram']){
   const stateResponse=await realFetch(base+'/api/social/'+platform+'/oauth/state',{method:'POST',headers:{cookie}});
   assert.equal(stateResponse.status,201);
   const stateBody=await stateResponse.json();
   const authorization=new URL(stateBody.authorizationUrl);
   assert.equal(authorization.searchParams.get('state'),stateBody.state);
   const callback=await realFetch(base+'/api/social/'+platform+'/oauth/callback?code=provider-code&state='+encodeURIComponent(stateBody.state),{headers:{cookie},redirect:'manual'});
   assert.equal(callback.status,302);
   assert.match(callback.headers.get('location'),new RegExp('social_connected='+platform));
  }
  const user=(await store.findManyAsync('users',{email:'social-owner@example.test'}))[0];
  const connections=await social.listConnections(user.id);
  assert.ok(connections.some(item=>item.platform==='linkedin'&&item.platformAccountId==='linkedin-member-9'));
  assert.ok(connections.some(item=>item.platform==='instagram'&&item.platformAccountId==='instagram-user-7'));
  const instagram=connections.find(item=>item.platform==='instagram');
  assert.equal((await social.getConnectionCredentials(user.id,instagram.id)).accessToken,'instagram-long-token');
  const refreshed=await realFetch(base+'/api/social/connections/'+instagram.id+'/refresh',{method:'POST',headers:{cookie}});
  assert.equal(refreshed.status,200);
  assert.equal((await social.getConnectionCredentials(user.id,instagram.id)).accessToken,'instagram-refreshed-token');
 }finally{
  global.fetch=realFetch;
  for(const config of Object.values(providers)){
   delete process.env[config.id+'_CLIENT_ID'];
   delete process.env[config.id+'_CLIENT_SECRET'];
   delete process.env[config.id+'_REDIRECT_URI'];
  }
 }
});
