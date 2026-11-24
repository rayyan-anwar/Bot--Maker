'use strict';

const express=require('express');
const multer=require('multer');
const rateLimit=require('express-rate-limit');
const {v4:uuidv4}=require('uuid');
const store=require('./store');
const {requireAuth}=require('./auth');
const providers=require('./providers');
const usage=require('./usage');
const {PostgresRateLimitStore}=require('./rate-limit-store');
const router=express.Router();

const MAX_IMAGE_BYTES=4*1024*1024;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_IMAGE_BYTES,files:1,fields:2,fieldSize:1000,parts:3}});
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});

const limiter=rateLimit({
 windowMs:60*1000,
 limit:process.env.NODE_ENV==='test'?1000:5,
 standardHeaders:'draft-7',
 legacyHeaders:false,
 keyGenerator:req=>req.user.id,
 store:store.isPostgres()?new PostgresRateLimitStore('vision-user',store.query):undefined,
 message:{error:'Too many visual analysis requests. Please wait before trying again.'}
});

function detectImageType(buffer){
 if(!Buffer.isBuffer(buffer))return null;
 if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return 'image/jpeg';
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}

router.post('/analyze',requireAuth,limiter,upload.single('image'),async(req,res,next)=>{
 let quota=null,budget=null,providerStarted=false,providerResult=null,botId=null;
 try{
  if(req.body?.userInitiated!=='true')return res.status(400).json({error:'Start visual analysis explicitly before sending an image.'});
  if(!req.file)return res.status(400).json({error:'Choose one image to analyze.'});
  const mimeType=detectImageType(req.file.buffer);
  if(!mimeType)return res.status(415).json({error:'Only valid JPEG, PNG, and WebP images are supported.'});
  botId=String(req.body.botId||'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(botId))return res.status(400).json({error:'A valid botId is required for chat history.'});
  const bot=await store.findByIdAsync('bots',botId);
  if(!bot)return res.status(404).json({error:'Bot not found.'});
  if(bot.ownerId!==req.user.id&&!bot.isPublic)return res.status(403).json({error:'You do not have access to this bot.'});
  if(!providers.isProviderConfigured('openai'))return res.status(503).json({error:'Fortisni visual analysis is not configured on this server.'});
  const prompt=typeof req.body.prompt==='string'&&req.body.prompt.trim()?req.body.prompt.trim():'Describe the image and point out important visible details.';
  if(prompt.length>1000)return res.status(400).json({error:'The visual question must be 1 to 1000 characters.'});
  quota=await usage.assertCanSend(req.user.id);
  const generation={provider:'openai',model:process.env.OPENAI_VISION_MODEL||'gpt-5.5',system:'Fortisni visual analysis',messages:[{role:'user',content:prompt+' '.padEnd(4096,'x')}],maxTokens:512};
  budget=await usage.reserveAiBudget(generation);
  providerStarted=true;
  providerResult=await providers.generateVision({model:generation.model,prompt,imageBase64:req.file.buffer.toString('base64'),mimeType,maxTokens:512});
  if(budget)await usage.settleAiBudget(budget,providerResult);
  const createdAt=new Date().toISOString();
  const userMessage={id:uuidv4(),botId,userId:req.user.id,role:'user',content:'[Image provided; original image is not retained] '+prompt,createdAt};
  const assistantMessage={id:uuidv4(),botId,userId:req.user.id,role:'assistant',content:providerResult.text,createdAt:new Date().toISOString()};
  const usageRecord={id:uuidv4(),userId:req.user.id,botId,provider:'openai',model:generation.model,inputTokens:providerResult.inputTokens||0,outputTokens:providerResult.outputTokens||0,day:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString()};
  await store.commitChatTurn({userMessage,assistantMessage,usageRecord},quota.reservationId);
  quota=null;budget=null;
  return res.json({userMessage:{id:userMessage.id,role:userMessage.role,content:userMessage.content,createdAt:userMessage.createdAt},assistant:{id:assistantMessage.id,role:assistantMessage.role,content:assistantMessage.content,createdAt:assistantMessage.createdAt},provider:'openai',model:generation.model,serverMediaRetained:false});
 }catch(error){
  if(quota){try{if(providerResult)await usage.recordUsage({userId:req.user.id,botId,provider:'openai',model:process.env.OPENAI_VISION_MODEL||'gpt-5.5',inputTokens:providerResult.inputTokens,outputTokens:providerResult.outputTokens,reservationId:quota.reservationId});else await usage.releaseReservation(quota.reservationId);}catch(releaseError){console.error('Vision usage reservation requires reconciliation:',releaseError.message);}}
  if(budget&&!providerStarted){try{await usage.releaseAiBudget(budget);}catch(releaseError){console.error('Vision AI budget reservation requires reconciliation:',releaseError.message);}}
  if(error.status)return res.status(error.status).json({error:error.message});
  return next(error);
 }
});

module.exports={router,detectImageType,MAX_IMAGE_BYTES};
