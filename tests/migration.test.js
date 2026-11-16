const test=require('node:test');
const assert=require('node:assert/strict');
const {validateData}=require('../scripts/migrate-json-to-postgres');
const {randomUUID}=require('node:crypto');

function fixture(){
 const userId=randomUUID(),botId=randomUUID(),docId=randomUUID();
 return {
  users:[{id:userId,email:'test@example.com',name:'Test User',passwordHash:'$2a$12$hash',createdAt:new Date().toISOString()}],
  bots:[{id:botId,ownerId:userId,name:'Support',instructions:'Help customers',provider:'anthropic',createdAt:new Date().toISOString()}],
  documents:[{id:docId,botId,filename:'guide.txt',createdAt:new Date().toISOString(),chunks:[{id:randomUUID(),text:'Returns are accepted within 30 days.'}]}],
  messages:[{id:randomUUID(),botId,userId,role:'user',content:'What is the return policy?',createdAt:new Date().toISOString()}],
  usage:[{id:randomUUID(),userId,botId,provider:'anthropic',createdAt:new Date().toISOString()}],
  memory:[{id:randomUUID(),botId,userId,content:'Prefers concise answers',createdAt:new Date().toISOString()}]
 };
}

test('migration preflight accepts a consistent JSON store and reports counts',()=>{
 const data=fixture();
 assert.deepEqual(validateData(data),{users:1,bots:1,documents:1,messages:1,usage:1,memory:1});
});

test('migration preflight rejects a bot with a missing owner',()=>{
 const data=fixture();data.bots[0].ownerId=randomUUID();
 assert.throws(()=>validateData(data),/bot owner does not exist/);
});

test('migration preflight rejects orphaned documents and messages',()=>{
 const docs=fixture();docs.documents[0].botId=randomUUID();
 assert.throws(()=>validateData(docs),/document references missing bot/);
 const messages=fixture();messages.messages[0].userId=randomUUID();
 assert.throws(()=>validateData(messages),/message references a missing user or bot/);
});

test('migration preflight rejects invalid roles, UUIDs and duplicate emails',()=>{
 const role=fixture();role.messages[0].role='system';
 assert.throws(()=>validateData(role),/invalid message role/);
 const uuid=fixture();uuid.users[0].id='not-a-uuid';
 assert.throws(()=>validateData(uuid),/user.id must be a valid UUID/);
 const email=fixture();email.users.push({...email.users[0],id:randomUUID(),email:'TEST@example.com'});
 assert.throws(()=>validateData(email),/duplicate user email/);
});

test('migration preflight rejects orphaned usage and memory records',()=>{
 const usage=fixture();usage.usage[0].userId=randomUUID();
 assert.throws(()=>validateData(usage),/usage references missing user/);
 const memory=fixture();memory.memory[0].botId=randomUUID();
 assert.throws(()=>validateData(memory),/memory references a missing user or bot/);
});

test('migration preflight rejects malformed document chunks',()=>{
 const data=fixture();data.documents[0].chunks='not-an-array';
 assert.throws(()=>validateData(data),/document chunks must be an array/);
});
