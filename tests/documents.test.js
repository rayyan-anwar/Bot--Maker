const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {extractText}=require('../server/documents');

async function withFile(name,bytes,fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-doc-'));
 const file=path.join(dir,'upload');
 try{fs.writeFileSync(file,bytes);await fn(file,name);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('text document extraction accepts valid UTF-8',async()=>{
 await withFile('notes.txt',Buffer.from('BotForge documentation\nनमस्ते','utf8'),async file=>{
  assert.equal(await extractText(file,'notes.txt'),'BotForge documentation\nनमस्ते');
 });
});

test('text document extraction rejects invalid UTF-8',async()=>{
 await withFile('invalid.txt',Buffer.from([0xc3,0x28]),async file=>{
  await assert.rejects(()=>extractText(file,'invalid.txt'),/valid UTF-8/);
 });
});

test('text document extraction rejects binary payloads',async()=>{
 await withFile('binary.md',Buffer.from([0x41,0x00,0x42]),async file=>{
  await assert.rejects(()=>extractText(file,'binary.md'),/Binary files/);
 });
});

test('PDF extraction rejects files without a PDF signature before parsing',async()=>{
 await withFile('fake.pdf',Buffer.from('not a pdf'),async file=>{
  await assert.rejects(()=>extractText(file,'fake.pdf'),/Invalid PDF signature/);
 });
});

test('document extraction enforces upload byte limits before reading content',async()=>{
 const file=path.join(os.tmpdir(),'botforge-too-large-'+process.pid);
 fs.writeFileSync(file,Buffer.alloc(5*1024*1024+1,0x41));
 try{await assert.rejects(()=>extractText(file,'large.txt'),/5 MB upload limit/);}
 finally{fs.rmSync(file,{force:true});}
});


test('document upload route rate-limits repeated uploads for an authenticated bot owner',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-upload-limit-'));
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='upload-limit-test-secret-with-at-least-thirty-two-characters';
 process.env.BOTFORGE_DATA_FILE=path.join(dir,'db.json');
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const bcrypt=require('bcryptjs'),{v4:uuidv4}=require('uuid'),store=require('../server/store');
 await store.insertAsync('users',{id:uuidv4(),email:'upload-limit@example.test',name:'Upload Limit',passwordHash:await bcrypt.hash('upload-limit-password-123',10),createdAt:new Date().toISOString()});
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'upload-limit@example.test',password:'upload-limit-password-123'})});
 assert.equal(login.status,200);
 const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
 const created=await fetch(base+'/api/bots',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'Upload limit bot',instructions:'Test uploads safely.'})});
 assert.equal(created.status,201);
 const bot=(await created.json()).bot;
 for(let i=0;i<10;i++){
  const response=await fetch(base+'/api/documents/'+bot.id,{method:'POST',headers:{cookie}});
  assert.equal(response.status,400);
 }
 const limited=await fetch(base+'/api/documents/'+bot.id,{method:'POST',headers:{cookie}});
 assert.equal(limited.status,429);
});
