const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const suiteDir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-doc-suite-'));
process.env.NODE_ENV='test';
process.env.JWT_SECRET='upload-limit-test-secret-with-at-least-thirty-two-characters';
process.env.BOTFORGE_DATA_FILE=path.join(suiteDir,'db.json');
const {extractText,publicDoc,getDocumentCapacityError,documentContentHash,MAX_DOCUMENTS_PER_BOT,MAX_DOCUMENT_TEXT_PER_BOT}=require('../server/documents');

async function withFile(name,bytes,fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'botforge-doc-'));
 const file=path.join(dir,'upload');
 try{fs.writeFileSync(file,bytes);await fn(file,name);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('public document metadata tolerates malformed chunks and never exposes content or vectors',()=>{
 const result=publicDoc({id:'doc-1',botId:'bot-1',filename:'safe.txt',createdAt:'2026-11-20T00:00:00.000Z',chunks:[
  null,{text:'private content',embedding:[0.1,0.2]},{text:'keyword only'}
 ]});
 assert.equal(result.chunkCount,2);
 assert.equal(result.indexedChunkCount,1);
 assert.equal(result.keywordSearchAvailable,true);
 assert.equal(result.semanticSearchAvailable,false);
 assert.equal(JSON.stringify(result).includes('private content'),false);
 assert.equal(JSON.stringify(result).includes('0.1'),false);
});

test('public document metadata handles missing and empty chunk collections',()=>{
 const empty=publicDoc({id:'doc-2',chunks:null});
 assert.equal(empty.chunkCount,0);
 assert.equal(empty.indexedChunkCount,0);
 assert.equal(empty.keywordSearchAvailable,false);
 assert.equal(empty.semanticSearchAvailable,false);
});

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
 process.env.NODE_ENV='test';
 process.env.JWT_SECRET='upload-limit-test-secret-with-at-least-thirty-two-characters';
 const {start,shutdown}=require('../server/index');
 const server=await start(0,'127.0.0.1');
 t.after(async()=>{await shutdown();fs.rmSync(suiteDir,{recursive:true,force:true});});
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


test('text extraction rejects a PDF renamed with a text extension',async()=>{
 await withFile('misnamed.txt',Buffer.from('%PDF-1.7\\nnot parsed'),async file=>{
  await assert.rejects(()=>extractText(file,'misnamed.txt'),/does not match/);
 });
});

test('text extraction rejects unsupported control characters',async()=>{
 await withFile('control.md',Buffer.from('safe text'+String.fromCharCode(1)+'unsafe','utf8'),async file=>{
  await assert.rejects(()=>extractText(file,'control.md'),/control characters/);
 });
});

test('text extraction rejects a PDF signature with a non-PDF extension',async()=>{
 await withFile('misnamed.md',Buffer.from('%PDF-1.7\\n'),async file=>{
  await assert.rejects(()=>extractText(file,'misnamed.md'),/does not match/);
 });
});


test('public document metadata does not count malformed vectors as indexed',()=>{
 const result=publicDoc({id:'doc-vectors',chunks:[
  {text:'valid',embedding:[0.1,0.2]},
  {text:'nan',embedding:[0.1,Number.NaN]},
  {text:'string',embedding:[0.1,'0.2']},
  {text:'empty',embedding:[]},
  {text:'missing'}
 ]});
 assert.equal(result.chunkCount,5);
 assert.equal(result.indexedChunkCount,1);
 assert.equal(result.semanticSearchAvailable,false);
});



test('knowledge base content hash is stable and changes with document content',()=>{
 assert.equal(documentContentHash('same content'),documentContentHash('same content'));
 assert.notEqual(documentContentHash('same content'),documentContentHash('different content'));
 assert.throws(()=>documentContentHash(null),TypeError);
});

test('knowledge base rejects duplicate documents by exact extracted content',()=>{
 const hash=documentContentHash('duplicate body');
 const existing=[{id:'existing-doc',contentHash:hash}];
 assert.equal(existing.find(doc=>doc.contentHash===documentContentHash('duplicate body')).id,'existing-doc');
 assert.equal(existing.find(doc=>doc.contentHash===documentContentHash('different body')),undefined);
});

test('knowledge base enforces per-bot document count and total text capacity',()=>{
 const fifty=Array.from({length:MAX_DOCUMENTS_PER_BOT},(_,i)=>({chunks:[{text:'x'}]}));
 assert.match(getDocumentCapacityError(fifty,'new'),/50-document limit/);
 const nearLimit=[{chunks:[{text:'x'.repeat(MAX_DOCUMENT_TEXT_PER_BOT-1)}]}];
 assert.match(getDocumentCapacityError(nearLimit,'xx'),/5-million-character/);
 assert.equal(getDocumentCapacityError(nearLimit,'x'),null);
 assert.throws(()=>getDocumentCapacityError([],null),TypeError);
});


test('knowledge document storage atomically enforces per-bot duplicate and capacity guards',async()=>{
 const store=require('../server/store'),{v4:uuidv4}=require('uuid'),botId=uuidv4();
 const first={id:uuidv4(),botId,contentHash:documentContentHash('alpha'),characterCount:5,chunks:[{id:uuidv4(),text:'alpha'}],filename:'alpha.txt'};
 const inserted=await store.insertDocumentWithinCapacity(first,{maxDocuments:2,maxCharacters:10});
 assert.equal(inserted.inserted,true);
 const duplicate=await store.insertDocumentWithinCapacity({...first,id:uuidv4()},{maxDocuments:2,maxCharacters:10});
 assert.equal(duplicate.inserted,false);assert.equal(duplicate.reason,'duplicate');assert.equal(duplicate.document.id,first.id);
 const second={id:uuidv4(),botId,contentHash:documentContentHash('bravo'),characterCount:5,chunks:[{id:uuidv4(),text:'bravo'}],filename:'bravo.txt'};
 assert.equal((await store.insertDocumentWithinCapacity(second,{maxDocuments:2,maxCharacters:10})).inserted,true);
 const countLimit=await store.insertDocumentWithinCapacity({...second,id:uuidv4(),contentHash:documentContentHash('charlie')},{maxDocuments:2,maxCharacters:100});
 assert.equal(countLimit.reason,'document_limit');
 const otherBot=uuidv4(),textLimit=await store.insertDocumentWithinCapacity({...second,id:uuidv4(),botId:otherBot,contentHash:documentContentHash('123456') ,characterCount:6,chunks:[{text:'123456'}]},{maxDocuments:2,maxCharacters:5});
 assert.equal(textLimit.reason,'character_limit');
 for(const doc of [first,second])await store.deleteByIdAsync('documents',doc.id);
});
