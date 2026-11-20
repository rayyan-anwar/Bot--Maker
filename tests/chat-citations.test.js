const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCitationSources}=require('../server/chat');

test('RAG citations preserve stable document and chunk references',()=>{
 const rows=buildCitationSources([
  {documentId:'doc-1',chunkId:'chunk-1',filename:'policy.pdf',text:'Refunds are available within thirty days.'},
  {documentId:'doc-2',chunkId:'chunk-2',filename:'guide.md',text:'Contact support for assistance.'}
 ]);
 assert.deepEqual(rows.map(row=>row.citation),[1,2]);
 assert.equal(rows[0].documentId,'doc-1');
 assert.equal(rows[0].chunkId,'chunk-1');
 assert.equal(rows[1].chunkId,'chunk-2');
});

test('RAG citation builder drops malformed rows and duplicate source chunks',()=>{
 const rows=buildCitationSources([
  null,{filename:'empty',text:'  '},
  {documentId:'doc-1',chunkId:'chunk-1',filename:'policy.pdf',text:'Refund terms.'},
  {documentId:'doc-1',chunkId:'chunk-1',filename:'policy.pdf',text:'Refund terms.'}
 ]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].citation,1);
 assert.equal(rows[0].excerpt,'Refund terms.');
});

test('RAG citation builder bounds displayed source metadata',()=>{
 const rows=buildCitationSources([{filename:'f'.repeat(300),documentId:'d',chunkId:'c',text:'x'.repeat(500)}]);
 assert.equal(rows[0].filename.length,160);
 assert.equal(rows[0].excerpt.length,280);
});
