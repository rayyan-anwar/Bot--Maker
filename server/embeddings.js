const MODEL=process.env.BOTFORGE_EMBEDDING_MODEL||'text-embedding-3-small';
function enabled(){return process.env.BOTFORGE_EMBEDDINGS_ENABLED==='true'&&!!process.env.OPENAI_API_KEY;}
function timeoutMs(){const configured=Number(process.env.BOTFORGE_EMBEDDING_TIMEOUT_MS||15000);return Math.min(30000,Math.max(1000,Number.isFinite(configured)?configured:15000));}
async function embedTexts(inputs){
 if(!enabled()||!Array.isArray(inputs)||!inputs.length)return null;
 if(inputs.some(value=>typeof value!=='string'||!value.trim()||value.length>1000000))throw new Error('Embedding input contains invalid text.');
 const vectors=[];
 for(let start=0;start<inputs.length;start+=64){
  const batch=inputs.slice(start,start+64),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs());
  try{
   const response=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json',authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:MODEL,input:batch,encoding_format:'float'})});
   let data={};try{data=await response.json();}catch(_){}
   if(!response.ok)throw new Error('Embedding provider request failed ('+response.status+').');
   const rows=data&&Array.isArray(data.data)?data.data.slice():[];
   if(rows.length!==batch.length||rows.some(row=>!row||!Number.isInteger(row.index)||row.index<0||row.index>=batch.length||!Array.isArray(row.embedding)||!row.embedding.length||row.embedding.some(value=>!Number.isFinite(value))))throw new Error('Embedding provider returned an invalid vector batch.');
   const indices=new Set(rows.map(row=>row.index));
   if(indices.size!==batch.length)throw new Error('Embedding provider returned duplicate vector indexes.');
   rows.sort((a,b)=>a.index-b.index);
   const dimensions=rows[0].embedding.length;
   if(rows.some(row=>row.embedding.length!==dimensions)||vectors.length&&vectors[0].length!==dimensions)throw new Error('Embedding provider returned inconsistent vector dimensions.');
   vectors.push(...rows.map(row=>row.embedding));
  }catch(error){
   if(error.name==='AbortError')throw new Error('Embedding provider request timed out.');
   throw error;
  }finally{clearTimeout(timer);}
 }
 return vectors;
}
module.exports={enabled,embedTexts,MODEL};
