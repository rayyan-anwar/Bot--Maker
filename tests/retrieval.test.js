const test=require('node:test');
const assert=require('node:assert/strict');
const {chunkText,topChunks}=require('../server/retrieval');

test('chunkText returns no chunks for blank text',()=>assert.deepEqual(chunkText('   '),[]));
test('chunkText splits long text and preserves content',()=>{
 const text=Array.from({length:500},(_,i)=>'word'+i).join(' ');
 const chunks=chunkText(text,100,10);
 assert.ok(chunks.length>1);
 assert.match(chunks[0],/word0/);
 assert.match(chunks.at(-1),/word499/);
});
test('topChunks ranks matching content and returns source filename',()=>{
 const docs=[{filename:'guide.txt',chunks:[{text:'apples and oranges are fruit'},{text:'server database architecture'}]}];
 const result=topChunks(docs,'database architecture',1);
 assert.equal(result[0].filename,'guide.txt');
 assert.match(result[0].text,/database/);
});
