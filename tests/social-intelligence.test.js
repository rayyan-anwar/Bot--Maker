const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-social-oauth-'));
process.env.NODE_ENV='test';
process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
delete process.env.DATABASE_URL;
process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY=require('node:crypto').randomBytes(32).toString('base64');
const social=require('../server/social-intelligence');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

test('social OAuth state is bound to user and platform and is single-use',async()=>{
 const now=new Date('2026-01-01T00:00:00.000Z');
 const created=await social.createOAuthState('user-1','instagram',now);
 assert.equal(created.state.length,43);
 assert.equal(created.codeChallengeMethod,'S256');
 assert.equal(typeof created.codeChallenge,'string');
 assert.equal(await social.consumeOAuthState(created.state,'user-2','instagram',new Date(now.getTime()+1000)),null);
 assert.equal(await social.consumeOAuthState(created.state,'user-1','youtube',new Date(now.getTime()+1000)),null);
 const consumed=await social.consumeOAuthState(created.state,'user-1','instagram',new Date(now.getTime()+1000));
 assert.equal(consumed.userId,'user-1');
 assert.equal(consumed.platform,'instagram');
 assert.equal(typeof consumed.codeVerifier,'string');
 assert.equal(await social.consumeOAuthState(created.state,'user-1','instagram',new Date(now.getTime()+2000)),null);
});

test('social OAuth state expires and invalid platforms are rejected',async()=>{
 const now=new Date('2026-01-01T00:00:00.000Z');
 const created=await social.createOAuthState('user-1','youtube',now);
 assert.equal(await social.consumeOAuthState(created.state,'user-1','youtube',new Date(now.getTime()+social.STATE_TTL_MS)),null);
 await assert.rejects(()=>social.createOAuthState('user-1','unsupported',now),TypeError);
 await assert.rejects(()=>social.createOAuthState('', 'instagram',now),TypeError);
});

test('PKCE uses S256 and platform catalogue never exposes credentials',()=>{
 const pair=social.createPkcePair();
 const crypto=require('node:crypto');
 assert.equal(pair.method,'S256');
 assert.equal(pair.challenge,crypto.createHash('sha256').update(pair.verifier).digest('base64url'));
 const rows=social.getPlatforms();
 assert.deepEqual(rows.map(x=>x.id),['instagram','youtube','linkedin']);
 for(const row of rows){
  assert.equal(row.liveOAuthAvailable,false);
  assert.equal(row.publishingAvailable,false);
  assert.equal(Object.hasOwn(row,'clientSecret'),false);
 }
});


test('social access tokens use authenticated AES-256-GCM envelopes',()=>{
 const plaintext='access-token-never-store-in-plaintext';
 const envelope=social.encryptToken(plaintext);
 assert.equal(envelope.algorithm,'A256GCM');
 assert.equal(envelope.version,1);
 assert.equal(JSON.stringify(envelope).includes(plaintext),false);
 assert.equal(social.decryptToken(envelope),plaintext);
 const tampered={...envelope,ciphertext:Buffer.from('tampered').toString('base64url')};
 assert.throws(()=>social.decryptToken(tampered),/Unable to decrypt/);
});

test('social token encryption fails closed when key is missing or malformed',()=>{
 const original=process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY;
 try{
  delete process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY;
  assert.throws(()=>social.encryptToken('secret'),/must be a base64-encoded 32-byte key/);
  process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY='not-a-key';
  assert.throws(()=>social.encryptToken('secret'),/must be a base64-encoded 32-byte key/);
 }finally{process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY=original;}
});
