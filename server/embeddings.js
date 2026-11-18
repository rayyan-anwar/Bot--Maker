const MODEL=process.env.BOTFORGE_EMBEDDING_MODEL||'text-embedding-3-small';
function enabled(){return process.env.BOTFORGE_EMBEDDINGS_ENABLED==='true'&&!!process.env.OPENAI_API_KEY;}
async function embedTexts(inputs){
 if(!enabled()||!Array.isArray(inputs)||!inputs.length)return null;
 const vectors=[];
 for(let start=0;start<inputs.length;start+=64){
  const batch=inputs.slice(start,start+64);
  const response=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:MODEL,input:batch,encoding_format:'float'})});
  let data={};try{data=await response.json();}catch(_){}
  if(!response.ok)throw new Error('Embedding provider request failed ('+response.status+').');
  const rows=(data.data||[]).slice().sort((a,b)=>a.index-b.index);
  if(rows.length!==batch.length||rows.some(row=>!Array.isArray(row.embedding)))throw new Error('Embedding provider returned an invalid vector batch.');
  vectors.push(...rows.map(row=>row.embedding));
 }
 return vectors;
}
module.exports={enabled,embedTexts,MODEL};
