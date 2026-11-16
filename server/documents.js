const express=require('express');
const fs=require('fs');
const path=require('path');
const multer=require('multer');
const {v4:uuidv4}=require('uuid');
const store=require('./store');
const {requireAuth}=require('./auth');
const {chunkText}=require('./retrieval');
const router=express.Router();
const UPLOAD_DIR=path.join(__dirname,'..','uploads');
fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const upload=multer({dest:UPLOAD_DIR,limits:{fileSize:5*1024*1024,files:1,fields:4},fileFilter:(req,file,cb)=>{
 const ext=path.extname(file.originalname).toLowerCase();
 const ok=['.txt','.md','.pdf'].includes(ext);
 cb(ok?null:new Error('Only .txt, .md, and .pdf files are supported.'),ok);
}});
function publicDoc(doc){return {id:doc.id,botId:doc.botId,filename:doc.filename,chunkCount:doc.chunks.length,createdAt:doc.createdAt};}
function requireBotOwner(req,res,next){
 const bot=store.findById('bots',req.params.botId);if(!bot)return res.status(404).json({error:'Bot not found.'});
 if(bot.ownerId!==req.user.id)return res.status(403).json({error:'Only the owner can manage bot documents.'});
 req.bot=bot;next();
}
async function extractText(filePath,originalName){
 const ext=path.extname(originalName).toLowerCase();const buffer=fs.readFileSync(filePath);
 if(ext==='.pdf'){
  if(buffer.subarray(0,5).toString()!=='%PDF-')throw new Error('Invalid PDF signature.');
  const pdfParse=require('pdf-parse');const data=await pdfParse(buffer);
  if(data.numpages>100)throw new Error('PDF exceeds the 100-page limit.');
  return data.text;
 }
 if(buffer.includes(0))throw new Error('Binary files are not supported.');
 return buffer.toString('utf8');
}
router.get('/:botId',requireAuth,requireBotOwner,(req,res)=>res.json({documents:store.all('documents').filter(d=>d.botId===req.botId).map(publicDoc)}));
router.post('/:botId',requireAuth,requireBotOwner,upload.single('file'),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'No file received.'});
 try{
  const text=await extractText(req.file.path,req.file.originalname);
  if(!text.trim()||text.length>1000000)return res.status(400).json({error:'Document must contain readable text and be no larger than 1 million extracted characters.'});
  const pieces=chunkText(text,220,40);
  if(!pieces.length)return res.status(400).json({error:'That file does not contain readable text.'});
  const doc={id:uuidv4(),botId:req.params.botId,filename:path.basename(req.file.originalname).slice(0,180),chunks:pieces.map(text=>({id:uuidv4(),text})),createdAt:new Date().toISOString()};
  store.insert('documents',doc);res.status(201).json({document:publicDoc(doc)});
 }catch(err){
  console.error('Document processing failed:',err.message);
  res.status(400).json({error:err.message==='Invalid PDF signature.'||err.message==='Binary files are not supported.'||err.message==='PDF exceeds the 100-page limit.'?err.message:'Could not safely read that document.'});
 }finally{fs.unlink(req.file.path,()=>{});}
});
router.delete('/:botId/:docId',requireAuth,requireBotOwner,(req,res)=>{
 const doc=store.findById('documents',req.params.docId);
 if(!doc||doc.botId!==req.params.botId)return res.status(404).json({error:'Document not found.'});
 store.deleteById('documents',doc.id);res.json({ok:true});
});
module.exports={router};
