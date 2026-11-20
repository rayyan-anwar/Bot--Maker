const express=require('express');const fs=require('fs');const path=require('path');const multer=require('multer');const rateLimit=require('express-rate-limit');const {v4:uuidv4}=require('uuid');const crypto=require('node:crypto');const store=require('./store');const {requireAuth}=require('./auth');const {chunkText}=require('./retrieval');const embeddings=require('./embeddings');const router=express.Router();
const {PostgresRateLimitStore}=require('./rate-limit-store');
const malwareScanner=require('./malware-scan');
const uploadLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,store:store.isPostgres()?new PostgresRateLimitStore('uploads',store.query):undefined,message:{error:'Too many document uploads. Try again later.'}});
const UPLOAD_DIR=path.join(__dirname,'..','uploads');fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const upload=multer({dest:UPLOAD_DIR,limits:{fileSize:5*1024*1024,files:1,fields:4,fieldSize:8*1024,headerPairs:100},fileFilter:(req,file,cb)=>{const ok=['.txt','.md','.pdf'].includes(path.extname(file.originalname).toLowerCase());cb(ok?null:new Error('Only .txt, .md, and .pdf files are supported.'),ok);}});
function publicDoc(d){const chunks=Array.isArray(d.chunks)?d.chunks.filter(c=>c&&typeof c==='object'):[];const indexedChunkCount=chunks.filter(c=>Array.isArray(c.embedding)&&c.embedding.length>0&&c.embedding.every(value=>typeof value==='number'&&Number.isFinite(value))).length;return {id:d.id,botId:d.botId,filename:d.filename,chunkCount:chunks.length,indexedChunkCount,keywordSearchAvailable:chunks.length>0,semanticSearchAvailable:chunks.length>0&&indexedChunkCount===chunks.length,createdAt:d.createdAt};}
async function requireBotOwner(req,res,next){try{const bot=await store.findByIdAsync('bots',req.params.botId);if(!bot)return res.status(404).json({error:'Bot not found.'});if(bot.ownerId!==req.user.id)return res.status(403).json({error:'Only the owner can manage bot documents.'});req.bot=bot;next();}catch(e){next(e);}}
const {Worker}=require('node:worker_threads');
const MAX_UPLOAD_BYTES=5*1024*1024,MAX_EXTRACTED_CHARS=1000000,MAX_PDF_PAGES=100,PDF_TIMEOUT_MS=8000,MAX_DOCUMENTS_PER_BOT=50,MAX_DOCUMENT_TEXT_PER_BOT=5000000;
function getDocumentCapacityError(existingDocs,text){
 if(!Array.isArray(existingDocs)||typeof text!=='string')throw new TypeError('Document capacity input is invalid.');
 if(existingDocs.length>=MAX_DOCUMENTS_PER_BOT)return 'This bot has reached its 50-document limit.';
 const storedCharacters=existingDocs.reduce((total,doc)=>total+(Array.isArray(doc?.chunks)?doc.chunks.reduce((sum,chunk)=>sum+(typeof chunk?.text==='string'?chunk.text.length:0),0):0),0);
 if(storedCharacters+text.length>MAX_DOCUMENT_TEXT_PER_BOT)return 'This bot has reached its 5-million-character knowledge limit.';
 return null;
}
function documentContentHash(text){if(typeof text!=='string')throw new TypeError('Document text must be a string.');return crypto.createHash('sha256').update(text,'utf8').digest('hex');}
function parsePdfInWorker(buffer){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'pdf-worker.js'),{workerData:buffer,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
  const timer=setTimeout(()=>{worker.terminate().catch(()=>{});finish(new Error('PDF parsing timed out.'));},PDF_TIMEOUT_MS);
  worker.once('message',result=>{if(!result||result.ok!==true||typeof result.text!=='string'||!Number.isInteger(result.pages)){finish(new Error('PDF parsing failed.'));return;}if(result.pages>MAX_PDF_PAGES){finish(new Error('PDF exceeds the 100-page limit.'));return;}if(result.text.length>MAX_EXTRACTED_CHARS){finish(new Error('Extracted document text exceeds the 1 million character limit.'));return;}finish(null,result.text);});
  worker.once('error',()=>finish(new Error('PDF parsing failed.')));
  worker.once('exit',code=>{if(code!==0)finish(new Error('PDF parsing failed.'));});
 });
}
async function extractText(filePath,originalName){
 const ext=path.extname(originalName).toLowerCase(),stat=fs.statSync(filePath);
 if(!stat.isFile()||stat.size>MAX_UPLOAD_BYTES)throw new Error('File exceeds the 5 MB upload limit.');
 const buffer=fs.readFileSync(filePath);
 const hasPdfSignature=buffer.subarray(0,5).toString()==='%PDF-';
 if(ext==='.pdf'){
  if(!hasPdfSignature)throw new Error('Invalid PDF signature.');
  return parsePdfInWorker(buffer);
 }
 if(hasPdfSignature)throw new Error('File content does not match its .txt or .md extension.');
 if(buffer.includes(0))throw new Error('Binary files are not supported.');
 let text;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch(_){throw new Error('Text file must use valid UTF-8 encoding.');}
 if(Array.from(text).some(ch=>{const code=ch.charCodeAt(0);return (code>=0&&code<=8)||code===11||code===12||(code>=14&&code<=31)||code===127;}))throw new Error('Text file contains unsupported control characters.');
 if(text.length>MAX_EXTRACTED_CHARS)throw new Error('Extracted document text exceeds the 1 million character limit.');
 return text;
}
router.get('/:botId',requireAuth,requireBotOwner,async(req,res,next)=>{try{res.json({documents:(await store.findManyAsync('documents',{botId:req.bot.id})).map(publicDoc)});}catch(e){next(e);}});
router.post('/:botId',requireAuth,requireBotOwner,uploadLimiter,upload.single('file'),async(req,res,next)=>{if(!req.file)return res.status(400).json({error:'No file received.'});try{const uploadBytes=fs.readFileSync(req.file.path);await malwareScanner.scanBuffer(uploadBytes);const text=await extractText(req.file.path,req.file.originalname);if(!text.trim()||text.length>MAX_EXTRACTED_CHARS)return res.status(400).json({error:'Document must contain readable text and be no larger than 1 million extracted characters.'});const existingDocs=await store.findManyAsync('documents',{botId:req.bot.id}),contentHash=documentContentHash(text);const duplicate=existingDocs.find(doc=>doc.contentHash===contentHash);if(duplicate)return res.status(409).json({error:'This exact document is already in the bot knowledge base.',document:publicDoc(duplicate),duplicate:true});const capacityError=getDocumentCapacityError(existingDocs,text);if(capacityError)return res.status(409).json({error:capacityError});const pieces=chunkText(text,220,40);if(!pieces.length)return res.status(400).json({error:'That file does not contain readable text.'});let vectors=null;if(embeddings.enabled()){try{vectors=await embeddings.embedTexts(pieces);}catch(error){console.error('Document embeddings unavailable; storing keyword-search chunks:',error.message);}}const doc={id:uuidv4(),botId:req.params.botId,contentHash,characterCount:text.length,filename:path.basename(String(req.file.originalname).replace(/\\/g,'/')).slice(0,180),chunks:pieces.map((text,i)=>({id:uuidv4(),text,...(vectors?{embedding:vectors[i]}:{})})),createdAt:new Date().toISOString()};await store.insertAsync('documents',doc);res.status(201).json({document:publicDoc(doc)});}catch(err){console.error('Document processing failed:',err.message);res.status(Number.isInteger(err.status)?err.status:400).json({error:err.status===503?err.message:err.status===422?err.message:err.message==='Invalid PDF signature.'||err.message==='Binary files are not supported.'||err.message==='PDF exceeds the 100-page limit.'||err.message.includes('does not match')||err.message.includes('control characters')?err.message:'Could not safely read that document.'});}finally{fs.unlink(req.file.path,()=>{});}});
router.post('/:botId/:docId/reindex',requireAuth,requireBotOwner,async(req,res,next)=>{try{const doc=await store.findByIdAsync('documents',req.params.docId);if(!doc||doc.botId!==req.bot.id)return res.status(404).json({error:'Document not found.'});if(!embeddings.enabled())return res.status(503).json({error:'Semantic indexing is not configured. Keyword search remains available.'});const chunks=Array.isArray(doc.chunks)?doc.chunks:[];if(!chunks.length)return res.status(422).json({error:'Document has no readable chunks to index.'});if(chunks.some(chunk=>!chunk||typeof chunk.text!=='string'||!chunk.text.trim()))return res.status(422).json({error:'Document contains invalid text chunks and cannot be indexed.'});const vectors=await embeddings.embedTexts(chunks.map(c=>c.text));if(!Array.isArray(vectors)||vectors.length!==chunks.length)throw new Error('Embedding provider returned an incomplete index.');const updated={...doc,chunks:chunks.map((chunk,i)=>({...chunk,embedding:vectors[i]})),indexedAt:new Date().toISOString()};await store.updateByIdAsync('documents',doc.id,{chunks:updated.chunks,indexedAt:updated.indexedAt});res.json({document:publicDoc(updated)});}catch(error){console.error('Document reindex failed:',error.message);res.status(502).json({error:'Could not rebuild the semantic index. Existing keyword search remains available.'});}});
router.delete('/:botId/:docId',requireAuth,requireBotOwner,async(req,res,next)=>{try{const doc=await store.findByIdAsync('documents',req.params.docId);if(!doc||doc.botId!==req.params.botId)return res.status(404).json({error:'Document not found.'});await store.deleteByIdAsync('documents',doc.id);res.json({ok:true});}catch(e){next(e);}});
module.exports={router,extractText,parsePdfInWorker,publicDoc,getDocumentCapacityError,documentContentHash,MAX_DOCUMENTS_PER_BOT,MAX_DOCUMENT_TEXT_PER_BOT};
