'use strict';

const express=require('express');
const crypto=require('node:crypto');
const {requireAuth}=require('./auth');
const service=require('./automation-service');
const router=express.Router();
router.get('/',requireAuth,async(req,res,next)=>{try{res.json({workflows:await service.list(req.user.id)});}catch(e){next(e);}});
router.post('/',requireAuth,async(req,res,next)=>{try{const workflow=await service.create(req.user.id,req.body);res.status(201).json({workflow});}catch(e){res.status(e instanceof TypeError||e instanceof RangeError?400:409).json({error:e.message});}});
router.post('/:id/run',requireAuth,async(req,res,next)=>{try{const task=await service.run(req.user.id,req.params.id,req.body?.triggerData||{},req.get('idempotency-key')||undefined);if(!task)return res.status(404).json({error:'Workflow not found.'});res.status(202).json({task});}catch(e){res.status(e instanceof TypeError||e instanceof RangeError?400:409).json({error:e.message});}});
router.post('/:id/webhook',async(req,res,next)=>{try{const workflow=await service.getWebhookWorkflow(req.params.id);if(!workflow||workflow.trigger?.type!=='webhook')return res.status(404).json({error:'Webhook workflow not found.'});const supplied=String(req.get('x-botforge-webhook-secret')||'');const expected=String(workflow.trigger.secret||'');if(!expected||!supplied||!crypto.timingSafeEqual(crypto.createHash('sha256').update(supplied,'utf8').digest(),crypto.createHash('sha256').update(expected,'utf8').digest()))return res.status(401).json({error:'Invalid webhook secret.'});const task=await service.run(workflow.userId,workflow.id,req.body||{},req.get('x-botforge-event-id')||undefined);res.status(202).json({task});}catch(e){res.status(e instanceof TypeError||e instanceof RangeError?400:409).json({error:e.message});}});
router.patch('/:id',requireAuth,async(req,res,next)=>{try{const workflow=await service.getOwned(req.user.id,req.params.id);if(!workflow)return res.status(404).json({error:'Workflow not found.'});if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'enabled must be a boolean.'});const updated=await require('./store').updateByIdAsync('aiEngineerRuns',workflow.id,{enabled:req.body.enabled,updatedAt:new Date().toISOString()});res.json({workflow:updated});}catch(e){next(e);}});
module.exports={router};
