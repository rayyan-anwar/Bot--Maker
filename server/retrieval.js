// Very small "search my documents" helper.
//
// This does NOT use embeddings or a vector database — it splits uploaded
// documents into chunks and, for each chat message, scores every chunk by
// how many of the message's words it shares (classic keyword search).
// That's simple, free, and good enough for an MVP with modest-sized
// documents. If you outgrow it, the usual upgrade is to add an embeddings
// API (e.g. Voyage AI, which Anthropic recommends) and do similarity
// search instead of word-overlap — everything that calls into this file
// would stay the same.

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','to','of','and','or','in','on',
  'at','for','with','about','as','by','that','this','it','its','from','into','your','you',
  'i','me','my','we','our','they','their','he','she','him','her','what','which','who','whom',
  'do','does','did','can','could','should','would','will','shall','not','no','yes','if','then',
  'so','than','too','very','just','but','have','has','had','how','why','when','where'
]);

function tokenize(text) {
  return (String(text).toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}']+/gu) || []).filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Split a long text into overlapping chunks of roughly `size` words. */
function chunkText(text, size = 220, overlap = 40) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('Chunk size must be a positive integer.');
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= size) throw new RangeError('Chunk overlap must be a non-negative integer smaller than chunk size.');
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + size, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start = end - overlap;
  }
  return chunks;
}

/** Score how relevant a chunk is to a query using simple word overlap. */
function scoreChunk(chunkTokenCounts, queryTokens, documentFrequency, totalChunks, chunkLength, averageLength) {
  let score = 0;
  const k1 = 1.2, b = 0.75;
  for (const qt of queryTokens) {
    const frequency = chunkTokenCounts.get(qt) || 0;
    if (!frequency) continue;
    const df = documentFrequency.get(qt) || 0;
    const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
    const lengthNorm = 1 - b + b * (chunkLength / (averageLength || 1));
    score += idf * (frequency * (k1 + 1)) / (frequency + k1 * lengthNorm);
  }
  return score;
}

/**
 * Retrieve distinct, relevant chunks using BM25-style lexical ranking.
 * Malformed records are ignored so one damaged document cannot break chat.
 */
function topChunks(documents, query, k = 4) {
  if (!Number.isInteger(k) || k < 1) return [];
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || !Array.isArray(documents)) return [];

  const corpus = [];
  const documentFrequency = new Map();
  let totalWords = 0;
  for (const doc of documents) {
    if (!doc || !Array.isArray(doc.chunks)) continue;
    for (const chunk of doc.chunks) {
      if (!chunk || typeof chunk.text !== 'string' || !chunk.text.trim()) continue;
      const tokens = tokenize(chunk.text);
      if (!tokens.length) continue;
      const counts = new Map();
      for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
      for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      totalWords += tokens.length;
      corpus.push({ doc, chunk, counts, length: tokens.length, tokens });
    }
  }
  if (!corpus.length) return [];
  const averageLength = totalWords / corpus.length;
  const scored = [];
  const seen = new Set();
  for (const item of corpus) {
    const score = scoreChunk(item.counts, queryTokens, documentFrequency, corpus.length, item.length, averageLength);
    if (score <= 0) continue;
    const normalizedText = item.chunk.text.replace(/\\s+/g, ' ').trim().toLocaleLowerCase();
    const identity = String(item.doc.id || item.doc.filename || '') + '\\u0000' + normalizedText;
    if (seen.has(identity)) continue;
    seen.add(identity);
    scored.push({
      text: item.chunk.text,
      filename: typeof item.doc.filename === 'string' ? item.doc.filename : 'Untitled document',
      documentId: item.doc.id || null,
      chunkId: item.chunk.id || null,
      score
    });
  }
  scored.sort((a, b) => b.score - a.score ||
    String(a.filename).localeCompare(String(b.filename)) ||
    String(a.chunkId || '').localeCompare(String(b.chunkId || '')));
  return scored.slice(0, k);
}

function cosineSimilarity(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||!a.length)return 0;
 let dot=0,aa=0,bb=0;
 for(let i=0;i<a.length;i++){const x=a[i],y=b[i];if(!Number.isFinite(x)||!Number.isFinite(y))return 0;dot+=x*y;aa+=x*x;bb+=y*y;}
 return aa&&bb?dot/(Math.sqrt(aa)*Math.sqrt(bb)):0;
}
async function topChunksHybrid(documents,query,k=4){
 const keyword=topChunks(documents,query,Math.max(k,documents.reduce((n,d)=>n+(Array.isArray(d?.chunks)?d.chunks.length:0),0)));
 const embeddings=require('./embeddings');
 if(!embeddings.enabled())return keyword.slice(0,k);
 try{
  const [queryVector]=await embeddings.embedTexts([query]);
  const lexicalScores=new Map(keyword.map(item=>[item.chunkId,item.score]));
  const candidates=[];
  for(const doc of documents)for(const chunk of Array.isArray(doc?.chunks)?doc.chunks:[]){
   if(!chunk||typeof chunk.text!=='string')continue;
   const semantic=cosineSimilarity(queryVector,chunk.embedding);
   const lexical=lexicalScores.get(chunk.id)||0;
   if(semantic>0||lexical>0)candidates.push({text:chunk.text,filename:doc.filename,documentId:doc.id,chunkId:chunk.id,score:semantic*0.75+(lexical?Math.min(lexical/8,1)*0.25:0),semanticScore:semantic,keywordScore:lexical});
  }
  candidates.sort((a,b)=>b.score-a.score||String(a.filename).localeCompare(String(b.filename))||String(a.chunkId).localeCompare(String(b.chunkId)));
  return candidates.slice(0,k);
 }catch(error){return keyword.slice(0,k);}
}

/**
 * Evaluate retrieval against labelled queries. Each case is {query, relevantChunkIds}.
 * Reports recall@k and mean reciprocal rank without requiring a paid model/API.
 */
function evaluateRetrieval(documents,cases,k=4){
 if(!Array.isArray(cases)||!Number.isInteger(k)||k<1)throw new TypeError('Evaluation cases and a positive k are required.');
 if(!cases.length)return {queries:0,recallAtK:0,meanReciprocalRank:0};
 let recalled=0,reciprocal=0;
 for(const item of cases){
  if(!item||typeof item.query!=='string'||!Array.isArray(item.relevantChunkIds))throw new TypeError('Each evaluation case needs a query and relevantChunkIds.');
  const relevant=new Set(item.relevantChunkIds);
  if(!relevant.size)continue;
  const results=topChunks(documents,item.query,k);
  const rank=results.findIndex(row=>relevant.has(row.chunkId));
  if(rank>=0){recalled++;reciprocal+=1/(rank+1);}
 }
 const denominator=cases.filter(item=>Array.isArray(item.relevantChunkIds)&&item.relevantChunkIds.length>0).length;
 return {queries:denominator,recallAtK:denominator?recalled/denominator:0,meanReciprocalRank:denominator?reciprocal/denominator:0};
}

module.exports = { chunkText, topChunks, topChunksHybrid, cosineSimilarity, evaluateRetrieval };
