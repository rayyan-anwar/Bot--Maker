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


test('tokenization supports Hindi and other Unicode scripts',()=>{
 const docs=[{filename:'hindi.txt',chunks:[{text:'कृत्रिम बुद्धिमत्ता और मशीन लर्निंग'}]}];
 const result=topChunks(docs,'मशीन लर्निंग',1);
 assert.equal(result.length,1);
 assert.equal(result[0].filename,'hindi.txt');
});

test('chunkText rejects invalid sizes instead of looping forever',()=>{
 assert.throws(()=>chunkText('some text',0,0),RangeError);
 assert.throws(()=>chunkText('some text',10,10),RangeError);
 assert.throws(()=>chunkText('some text',10,-1),RangeError);
});


test('topChunks includes stable document and chunk references for citations',()=>{
 const docs=[{id:'doc-123',filename:'policy.pdf',chunks:[{id:'chunk-456',text:'refund policy and returns'}]}];
 const result=topChunks(docs,'refund returns',1);
 assert.equal(result[0].documentId,'doc-123');
 assert.equal(result[0].chunkId,'chunk-456');
});


const {cosineSimilarity,topChunksHybrid}=require('../server/retrieval');
test('cosine similarity validates vector dimensions and computes similarity',()=>{
 assert.equal(cosineSimilarity([1,0],[1,0]),1);
 assert.equal(cosineSimilarity([1,0],[0,1]),0);
 assert.equal(cosineSimilarity([1],[1,2]),0);
});
test('hybrid retrieval safely falls back to keyword search when embeddings are disabled',async()=>{
 const docs=[{id:'d1',filename:'source.txt',chunks:[{id:'c1',text:'refund policy returns within thirty days'}]}];
 const rows=await topChunksHybrid(docs,'refund returns',2);
 assert.equal(rows.length,1);assert.equal(rows[0].documentId,'d1');
});
