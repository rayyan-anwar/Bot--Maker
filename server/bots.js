const express=require('express');
const {v4:uuidv4}=require('uuid');
const store=require('./store');
const {requireAuth}=require('./auth');
const router=express.Router();
function publicBot(bot,includePrivate=false){
 const out={id:bot.id,ownerId:bot.ownerId,name:bot.name,description:bot.description||'',isPublic:!!bot.isPublic,createdAt:bot.createdAt,provider:bot.provider||'anthropic',model:bot.model||null};
 if(includePrivate)out.instructions=bot.instructions;
 return out;
}
function requireText(value,label,max,required=true){
 if(typeof value!=='string'||(required&&!value.trim())||value.length>max)return label+' must be a '+(required?'non-empty ':'')+'text of at most '+max+' characters.';
 return null;
}
router.get('/mine',requireAuth,(req,res)=>{res.json({bots:store.all('bots').filter(b=>b.ownerId===req.user.id).map(b=>publicBot(b,true))});});
router.get('/public',requireAuth,(req,res)=>{res.json({bots:store.all('bots').filter(b=>b.isPublic).map(b=>publicBot(b,false))});});
router.post('/',requireAuth,(req,res)=>{
 const {name,instructions,description='',isPublic=false,provider='anthropic',model=null}=req.body||{};
 const error=requireText(name,'Name',80)||requireText(instructions,'Instructions',6000)||requireText(description,'Description',200,false);
 if(error)return res.status(400).json({error});
 if(typeof isPublic!=='boolean'||!['anthropic','openai','gemini'].includes(provider)||(model!==null&&(typeof model!=='string'||model.length>100)))return res.status(400).json({error:'Invalid bot settings.'});
 const bot={id:uuidv4(),ownerId:req.user.id,name:name.trim(),description:description.trim(),instructions:instructions.trim(),isPublic,provider,model,createdAt:new Date().toISOString()};
 store.insert('bots',bot);res.status(201).json({bot:publicBot(bot,true)});
});
router.get('/:id',requireAuth,(req,res)=>{
 const bot=store.findById('bots',req.params.id);if(!bot)return res.status(404).json({error:'Bot not found.'});
 const isOwner=bot.ownerId===req.user.id;if(!isOwner&&!bot.isPublic)return res.status(403).json({error:'You do not have access to this bot.'});
 res.json({bot:publicBot(bot,isOwner),isOwner});
});
router.put('/:id',requireAuth,(req,res)=>{
 const bot=store.findById('bots',req.params.id);if(!bot)return res.status(404).json({error:'Bot not found.'});
 if(bot.ownerId!==req.user.id)return res.status(403).json({error:'Only the owner can edit this bot.'});
 const {name,instructions,description,isPublic,provider,model}=req.body||{};const patch={};
 if(name!==undefined){const e=requireText(name,'Name',80);if(e)return res.status(400).json({error:e});patch.name=name.trim();}
 if(instructions!==undefined){const e=requireText(instructions,'Instructions',6000);if(e)return res.status(400).json({error:e});patch.instructions=instructions.trim();}
 if(description!==undefined){const e=requireText(description,'Description',200,false);if(e)return res.status(400).json({error:e});patch.description=description.trim();}
 if(isPublic!==undefined){if(typeof isPublic!=='boolean')return res.status(400).json({error:'isPublic must be boolean.'});patch.isPublic=isPublic;}
 if(provider!==undefined){if(!['anthropic','openai','gemini'].includes(provider))return res.status(400).json({error:'Unsupported provider.'});patch.provider=provider;}
 if(model!==undefined){if(model!==null&&(typeof model!=='string'||model.length>100))return res.status(400).json({error:'Invalid model.'});patch.model=model;}
 const updated=store.updateById('bots',bot.id,patch);res.json({bot:publicBot(updated,true)});
});
router.delete('/:id',requireAuth,(req,res)=>{
 const bot=store.findById('bots',req.params.id);if(!bot)return res.status(404).json({error:'Bot not found.'});
 if(bot.ownerId!==req.user.id)return res.status(403).json({error:'Only the owner can delete this bot.'});
 store.deleteById('bots',bot.id);const db=store.load();db.documents=db.documents.filter(d=>d.botId!==bot.id);db.messages=db.messages.filter(m=>m.botId!==bot.id);db.memory=db.memory.filter(m=>m.botId!==bot.id);db.usage=db.usage.filter(u=>u.botId!==bot.id);store.persist();res.json({ok:true});
});
module.exports={router,publicBot};
