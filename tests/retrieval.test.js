const test=require('node:test');
const assert=require('node:assert/strict');
const {chunkText,topChunks,evaluateRetrieval}=require('../server/retrieval');

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


test('offline RAG evaluation reports recall@k and mean reciprocal rank',()=>{
 const docs=[{filename:'manual.md',chunks:[
  {id:'c1',text:'account password reset recovery instructions'},
  {id:'c2',text:'invoice payment billing subscription'},
  {id:'c3',text:'workspace project configuration settings'}
 ]}];
 const metrics=evaluateRetrieval(docs,[
  {query:'password reset',relevantChunkIds:['c1']},
  {query:'billing invoice',relevantChunkIds:['c2']},
  {query:'workspace settings',relevantChunkIds:['c3']}
 ],1);
 assert.deepEqual(metrics,{queries:3,recallAtK:1,meanReciprocalRank:1});
});
test('offline RAG evaluation reports misses and validates input',()=>{
 const docs=[{filename:'manual.md',chunks:[{id:'c1',text:'password recovery steps'}]}];
 const metrics=evaluateRetrieval(docs,[{query:'billing invoice',relevantChunkIds:['missing']}],1);
 assert.equal(metrics.recallAtK,0);assert.equal(metrics.meanReciprocalRank,0);
 assert.throws(()=>evaluateRetrieval(docs,[],0),TypeError);
});


test('BM25 retrieval prioritizes focused chunks and avoids duplicate chunk text',()=>{
 const docs=[
  {id:'d1',filename:'long.txt',chunks:[{id:'long',text:'refund policy returns customer support service contact details and additional unrelated material'}]},
  {id:'d2',filename:'focused.txt',chunks:[{id:'focused',text:'refund policy returns'},{id:'duplicate',text:'refund policy returns'}]}
 ];
 const rows=topChunks(docs,'refund policy returns',4);
 assert.equal(rows[0].chunkId,'focused');
 assert.equal(rows.filter(row=>row.text==='refund policy returns').length,1);
});

test('BM25 deduplicates equivalent whitespace across chunks',()=>{
 const docs=[{id:'d',filename:'notes.txt',chunks:[
  {id:'a',text:'refund policy\ncustomer returns'},
  {id:'b',text:'refund   policy customer returns'}
 ]}];
 const rows=topChunks(docs,'refund policy customer returns',5);
 assert.equal(rows.length,1);
});

test('retrieval ignores malformed document records and validates result limits',()=>{
 const docs=[null,{filename:'bad',chunks:null},{filename:'good',chunks:[null,{text:'secure account recovery steps'}]}];
 assert.equal(topChunks(docs,'account recovery',2).length,1);
 assert.deepEqual(topChunks(docs,'account recovery',0),[]);
});


test('chunkText rejects non-string input explicitly',()=>{
 assert.throws(()=>chunkText(null),TypeError);
 assert.throws(()=>chunkText({text:'not a string'}),TypeError);
});

test('hybrid retrieval validates result limits and malformed corpora',async()=>{
 assert.deepEqual(await topChunksHybrid(null,'query',2),[]);
 assert.deepEqual(await topChunksHybrid([], 'query',0),[]);
});


test('chunkText prefers sentence boundaries while retaining overlap',()=>{
 const chunks=chunkText('Alpha beta gamma delta. Epsilon zeta eta theta. Iota kappa.',6,2);
 assert.equal(chunks[0],'Alpha beta gamma delta.');
 assert.ok(chunks[1].startsWith('gamma delta. Epsilon'));
 assert.ok(chunks.join(' ').includes('kappa.'));
});

test('chunkText keeps hard size bounds when no sentence boundary exists',()=>{
 const chunks=chunkText('one two three four five six seven eight nine ten',4,1);
 assert.ok(chunks.every(chunk=>chunk.split(' ').length<=4));
 assert.match(chunks.join(' '),/ten/);
});


test('golden retrieval dataset meets bilingual recall and ranking thresholds',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const dataset=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/retrieval-golden.json'),'utf8'));
 const metrics=evaluateRetrieval(dataset.documents,dataset.cases,dataset.k);
 assert.equal(metrics.queries,dataset.cases.length);
 assert.ok(metrics.recallAtK>=dataset.minimumRecallAtK,'recall@k below configured threshold: '+JSON.stringify(metrics));
 assert.ok(metrics.meanReciprocalRank>=dataset.minimumMeanReciprocalRank,'MRR below configured threshold: '+JSON.stringify(metrics));
});
