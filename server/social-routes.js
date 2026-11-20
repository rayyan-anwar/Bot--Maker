'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const {requireAuth}=require('./auth');
const social=require('./social-intelligence');
const router=express.Router();
const stateLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,keyGenerator:req=>req.user.id,message:{error:'Too many social authorization attempts. Try again later.'}});
router.get('/platforms',requireAuth,(req,res)=>res.json({platforms:social.getPlatforms()}));
router.post('/:platform/oauth/state',requireAuth,stateLimiter,async(req,res,next)=>{
 try{
  if(!Object.prototype.hasOwnProperty.call(social.PLATFORMS,req.params.platform))return res.status(404).json({error:'Unsupported social platform.'});
  const authorization=await social.createOAuthState(req.user.id,req.params.platform);
  res.status(201).json({platform:req.params.platform,...authorization,authorizationUrlAvailable:false,notice:'OAuth app credentials, callback configuration and platform approval are required before redirect can be enabled.'});
 }catch(error){next(error);}
});
module.exports={router};
