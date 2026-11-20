const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const databaseUrl=process.env.BOTFORGE_TEST_DATABASE_URL;
test('PostgreSQL Social OAuth state is owner-bound and atomically single-use',{skip:!databaseUrl?'BOTFORGE_TEST_DATABASE_URL is not configured':false},async()=>{
 process.env.DATABASE_URL=databaseUrl;process.env.PGSSL='disable';
 process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
 const store=require('../server/store');
 const social=require('../server/social-intelligence');
 await store.initialize();
 const id=crypto.randomUUID(),userId=crypto.randomUUID(),stateHash=crypto.randomBytes(32).toString('hex');
 const record={id,stateHash,userId,platform:'instagram',codeVerifier:crypto.randomBytes(32).toString('base64url'),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
 try{
  await store.insertAsync('socialOAuthStates',record);
  assert.equal(await store.consumeSocialOAuthState(stateHash,crypto.randomUUID(),'instagram'),null);
  assert.ok(await store.findByIdAsync('socialOAuthStates',id),'wrong user must not consume OAuth state');
  const outcomes=await Promise.all([
   store.consumeSocialOAuthState(stateHash,userId,'instagram'),
   store.consumeSocialOAuthState(stateHash,userId,'instagram')
  ]);
  assert.equal(outcomes.filter(Boolean).length,1,'only one concurrent callback may consume the state');
  assert.equal(await store.findByIdAsync('socialOAuthStates',id),null);
  const connection=await social.connectAccount({userId,platform:'youtube',platformAccountId:'pg-channel-'+id,displayName:'PG channel',scopes:['analytics'],accessToken:'pg-access-secret',refreshToken:'pg-refresh-secret'});
  const secrets=await social.getConnectionCredentials(userId,connection.id);
  assert.equal(secrets.accessToken,'pg-access-secret');
  assert.equal(secrets.refreshToken,'pg-refresh-secret');
  assert.equal(await social.getConnectionCredentials(crypto.randomUUID(),connection.id),null);
  const stored=await store.findByIdAsync('socialConnections',connection.id);
  assert.equal(JSON.stringify(stored).includes('pg-access-secret'),false);
  assert.equal(await social.disconnectConnection(userId,connection.id),true);
 }finally{
  await store.deleteByIdAsync('socialOAuthStates',id);
  await store.close();
 }
});
