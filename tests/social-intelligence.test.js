const test=require('node:test');
const assert=require('node:assert/strict');
const social=require('../server/social-intelligence');

test('social OAuth state is bound to user and platform and is single-use',()=>{
 const {state}=social.createOAuthState('user-1','instagram',1000);
 assert.equal(state.length,43);
 assert.equal(social.consumeOAuthState(state,'user-2','instagram',1001),false);
 assert.equal(social.consumeOAuthState(state,'user-1','youtube',1001),false);
 assert.equal(social.consumeOAuthState(state,'user-1','instagram',1001),true);
 assert.equal(social.consumeOAuthState(state,'user-1','instagram',1001),false);
});

test('social OAuth state expires and invalid platforms are rejected',()=>{
 const {state}=social.createOAuthState('user-1','youtube',1000);
 assert.equal(social.consumeOAuthState(state,'user-1','youtube',1000+social.STATE_TTL_MS),false);
 assert.throws(()=>social.createOAuthState('user-1','unsupported',1000),TypeError);
 assert.throws(()=>social.createOAuthState('', 'instagram',1000),TypeError);
});

test('social platform catalogue exposes capabilities but never credentials',()=>{
 const rows=social.getPlatforms();
 assert.deepEqual(rows.map(x=>x.id),['instagram','youtube','linkedin']);
 for(const row of rows){
  assert.equal(row.liveOAuthAvailable,false);
  assert.equal(row.publishingAvailable,false);
  assert.equal(Object.hasOwn(row,'clientSecret'),false);
 }
});
