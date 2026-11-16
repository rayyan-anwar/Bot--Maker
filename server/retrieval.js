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
function scoreChunk(chunkTokenCounts, queryTokens) {
  let score = 0;
  for (const qt of queryTokens) {
    score += chunkTokenCounts.get(qt) || 0;
  }
  return score;
}

/**
 * Given a bot's documents (each with pre-split chunks) and a user message,
 * return the top-K most relevant chunks of text, each tagged with the
 * filename it came from.
 */
function topChunks(documents, query, k = 4) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored = [];
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      const tokens = tokenize(chunk.text);
      const counts = new Map();
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
      const score = scoreChunk(counts, queryTokens);
      if (score > 0) {
        scored.push({ text: chunk.text, filename: doc.filename, documentId: doc.id, chunkId: chunk.id, score });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}


function cosineSimilarity(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||!a.length)return 0;
 let dot=0,aa=0,bb=0;
 for(let i=0;i<a.length;i++){const x=a[i],y=b[i];if(!Number.isFinite(x)||!Number.isFinite(y))return 0;dot+=x*y;aa+=x*x;bb+=y*y;}
 return aa&&bb?dot/(Math.sqrt(aa)*Math.sqrt(bb)):0;
}
async function topChunksHybrid(documents,query,k=4){
 const keyword=topChunks(documents,query,Math.max(k,documents.reduce((n,d)=>n+(d.chunks||[]).length,0)));
 const embeddings=require('./embeddings');
 if(!embeddings.enabled())return keyword.slice(0,k);
 try{
  const [queryVector]=await embeddings.embedTexts([query]);
  const candidates=[];
  for(const doc of documents)for(const chunk of doc.chunks||[]){
   const semantic=cosineSimilarity(queryVector,chunk.embedding);
   const lexical=keyword.find(item=>item.chunkId===chunk.id)?.score||0;
   if(semantic>0||lexical>0)candidates.push({text:chunk.text,filename:doc.filename,documentId:doc.id,chunkId:chunk.id,score:semantic*0.75+(lexical?Math.min(lexical/8,1)*0.25:0),semanticScore:semantic,keywordScore:lexical});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates.slice(0,k);
 }catch(error){return keyword.slice(0,k);}
}

module.exports = { chunkText, topChunks, topChunksHybrid, cosineSimilarity };
