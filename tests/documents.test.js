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
