const express=require('express');
const crypto=require('node:crypto');
const store=require('./store');
const plans=require('./plans');
const {requireAuth}=require('./auth');
const router=express.Router(),webhookRouter=express.Router(),razorpayWebhookRouter=express.Router();
function safeEqualHex(expected,provided){try{const a=Buffer.from(expected,'hex'),b=Buffer.from(provided,'hex');return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);}catch(_){return false;}}
function signatureValid(raw,header,secret){
 if(!Buffer.isBuffer(raw)||typeof header!=='string'||!secret)return false;
 const parts=Object.fromEntries(header.split(',').map(part=>part.split('=').map(x=>x.trim())));
 const timestamp=Number(parts.t),signature=parts.v1;
 if(!Number.isFinite(timestamp)||!signature||Math.abs(Date.now()/1000-timestamp)>300)return false;
 const expected=crypto.createHmac('sha256',secret).update(String(timestamp)+'.').update(raw).digest('hex');
 return safeEqualHex(expected,signature);
}
function razorpaySignatureValid(raw,header,secret){
 if(!Buffer.isBuffer(raw)||typeof header!=='string'||!secret)return false;
 const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
 return safeEqualHex(expected,header);
}
function razorpayConfigured(){return !!(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_WEBHOOK_SECRET);}
function isRazorpaySubscriptionActive(status){return status==='active';}
function resolveRazorpayPlan(status,plan){return isRazorpaySubscriptionActive(status)&&plans.getPlans()[plan]?plan:'free';}
async function razorpayRequest(path,payload){
 const auth=Buffer.from(process.env.RAZORPAY_KEY_ID+':'+process.env.RAZORPAY_KEY_SECRET).toString('base64');
 const response=await fetch('https://api.razorpay.com/v1'+path,{method:'POST',headers:{authorization:'Basic '+auth,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 let data={};try{data=await response.json();}catch(_){}
 if(!response.ok)throw new Error(data.error?.description||'Razorpay could not process the request.');
 return data;
}
router.get('/plans',requireAuth,async(req,res,next)=>{try{const user=await store.findByIdAsync('users',req.user.id);res.json({plans:plans.getPlans(),currentPlan:plans.getPlanName(user),hasBillingCustomer:!!user.stripeCustomerId,providers:{stripe:!!process.env.STRIPE_SECRET_KEY,razorpay:razorpayConfigured()}});}catch(e){next(e);}});
router.post('/portal',requireAuth,async(req,res,next)=>{try{if(!process.env.STRIPE_SECRET_KEY||!req.user.stripeCustomerId)return res.status(409).json({error:'No Stripe billing customer is linked to this account.'});const returnUrl=process.env.STRIPE_PORTAL_RETURN_URL||process.env.STRIPE_SUCCESS_URL;if(!returnUrl)return res.status(503).json({error:'Billing portal return URL is not configured.'});const form=new URLSearchParams({customer:req.user.stripeCustomerId,return_url:returnUrl});const response=await fetch('https://api.stripe.com/v1/billing_portal/sessions',{method:'POST',headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,'content-type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(15000)});let data={};try{data=await response.json();}catch(_){}if(!response.ok||!data.url)return res.status(502).json({error:'The payment provider could not open the billing portal.'});res.json({portalUrl:data.url});}catch(e){next(e);}});
router.post('/checkout',requireAuth,async(req,res,next)=>{try{
 const {plan}=req.body||{},available=plans.getPlans();if(req.user.stripeSubscriptionId||req.user.razorpaySubscriptionId)return res.status(409).json({error:'This account already has a paid subscription. Manage or cancel it before starting another.'});
 if(typeof plan!=='string'||!['plus','pro'].includes(plan)||!available[plan])return res.status(400).json({error:'Choose a paid plan.'});
 const priceId=process.env[plan==='plus'?'STRIPE_PRICE_PLUS':'STRIPE_PRICE_PRO'];
 if(!process.env.STRIPE_SECRET_KEY||!priceId||!process.env.STRIPE_SUCCESS_URL||!process.env.STRIPE_CANCEL_URL)return res.status(503).json({error:'Stripe checkout is not configured by the service operator.'});
 const form=new URLSearchParams({mode:'subscription',success_url:process.env.STRIPE_SUCCESS_URL,cancel_url:process.env.STRIPE_CANCEL_URL,customer_email:req.user.email,client_reference_id:req.user.id,'line_items[0][price]':priceId,'line_items[0][quantity]':'1','metadata[userId]':req.user.id,'metadata[plan]':plan,'subscription_data[metadata][userId]':req.user.id,'subscription_data[metadata][plan]':plan});
 const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,'content-type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(15000)});let data={};try{data=await response.json();}catch(_){}
 if(!response.ok||!data.url)return res.status(502).json({error:'Stripe could not create a checkout session.'});res.json({checkoutUrl:data.url,provider:'stripe'});
 }catch(e){next(e);}});
router.post('/razorpay/checkout',requireAuth,async(req,res,next)=>{try{
 const {plan}=req.body||{},available=plans.getPlans();if(req.user.stripeSubscriptionId||req.user.razorpaySubscriptionId)return res.status(409).json({error:'This account already has a paid subscription. Manage or cancel it before starting another.'});
 if(typeof plan!=='string'||!['plus','pro'].includes(plan)||!available[plan])return res.status(400).json({error:'Choose a paid plan.'});
 if(!razorpayConfigured())return res.status(503).json({error:'Razorpay is not configured by the service operator.'});
 const planId=process.env[plan==='plus'?'RAZORPAY_PLAN_PLUS':'RAZORPAY_PLAN_PRO'];
 if(!planId)return res.status(503).json({error:'The selected Razorpay subscription plan is not configured.'});
 const subscription=await razorpayRequest('/subscriptions',{plan_id:planId,total_count:Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT||120),quantity:1,customer_notify:1,notes:{userId:req.user.id,plan}});
 if(!subscription.id||!subscription.short_url)throw new Error('Razorpay returned an incomplete subscription checkout.');
 const linked=await store.updateByIdAsync('users',req.user.id,{razorpaySubscriptionId:subscription.id,razorpayPlan:plan,razorpaySubscriptionStatus:subscription.status||'created'});if(!linked)throw new Error('Could not link the Razorpay subscription to the account.');
 res.json({checkoutUrl:subscription.short_url,subscriptionId:subscription.id,provider:'razorpay'});
 }catch(e){next(e);}});
webhookRouter.post('/',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
 const secret=process.env.STRIPE_WEBHOOK_SECRET,header=req.get('stripe-signature');if(!signatureValid(req.body,header,secret))return res.status(400).json({error:'Invalid webhook signature.'});
 let event;try{event=JSON.parse(req.body.toString('utf8'));}catch(_){return res.status(400).json({error:'Invalid webhook payload.'});}
 const eventId=event.id;if(typeof eventId!=='string'||!eventId)return res.status(400).json({error:'Webhook event ID is required.'});
 let claimed=false;
 try{
  claimed=await store.claimWebhookEvent('stripe',eventId);if(!claimed)return res.json({received:true,duplicate:true});
  if(event.type==='checkout.session.completed'){
   const session=event.data&&event.data.object,userId=session?.metadata?.userId,plan=session?.metadata?.plan;
   if(userId&&plans.getPlans()[plan]&&session.mode==='subscription'&&session.status==='complete'&&['paid','no_payment_required'].includes(session.payment_status)){const user=await store.findByIdAsync('users',userId);if(user)await store.updateByIdAsync('users',userId,{plan,stripeCustomerId:session.customer||null,stripeSubscriptionId:session.subscription||null});}
  }else if(event.type==='customer.subscription.updated'){
   const sub=event.data&&event.data.object,userId=sub?.metadata?.userId,plan=sub?.metadata?.plan;
   if(userId){const user=await store.findByIdAsync('users',userId);if(user){const active=['active','trialing'].includes(sub.status),nextPlan=active&&plans.getPlans()[plan]?plan:'free';await store.updateByIdAsync('users',userId,{plan:nextPlan,stripeSubscriptionId:active?sub.id:null});}}
  }else if(event.type==='customer.subscription.deleted'){
   const sub=event.data&&event.data.object,userId=sub?.metadata?.userId;if(userId){const user=await store.findByIdAsync('users',userId);if(user)await store.updateByIdAsync('users',userId,{plan:'free',stripeSubscriptionId:null});}
  }
  return res.json({received:true});
 }catch(error){if(claimed)await store.releaseWebhookEvent('stripe',eventId).catch(()=>{});console.error('Stripe webhook processing failed:',error.message);return res.status(500).json({error:'Webhook processing failed.'});}
});
razorpayWebhookRouter.post('/',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
 if(!razorpaySignatureValid(req.body,req.get('x-razorpay-signature'),process.env.RAZORPAY_WEBHOOK_SECRET))return res.status(400).json({error:'Invalid Razorpay webhook signature.'});
 let event;try{event=JSON.parse(req.body.toString('utf8'));}catch(_){return res.status(400).json({error:'Invalid webhook payload.'});}
 const eventId=req.get('x-razorpay-event-id');if(typeof eventId!=='string'||!eventId.trim()||eventId.length>255)return res.status(400).json({error:'Razorpay event ID header is required.'});
 let claimed=false;
 try{
  claimed=await store.claimWebhookEvent('razorpay',eventId);if(!claimed)return res.json({received:true,duplicate:true});
  const sub=event.payload?.subscription?.entity;if(sub){const userId=sub.notes?.userId,plan=sub.notes?.plan;if(userId){const user=await store.findByIdAsync('users',userId);if(user){const active=isRazorpaySubscriptionActive(sub.status),cancelled=['cancelled','completed'].includes(sub.status);await store.updateByIdAsync('users',userId,{plan:resolveRazorpayPlan(sub.status,plan),razorpaySubscriptionId:cancelled?null:sub.id,razorpaySubscriptionStatus:sub.status||'unknown',razorpayCustomerId:sub.customer_id||user.razorpayCustomerId||null});}}}
  return res.json({received:true});
 }catch(error){if(claimed)await store.releaseWebhookEvent('razorpay',eventId).catch(()=>{});console.error('Razorpay webhook processing failed:',error.message);return res.status(500).json({error:'Webhook processing failed.'});}
});
module.exports={router,webhookRouter,razorpayWebhookRouter,signatureValid,razorpaySignatureValid,isRazorpaySubscriptionActive,resolveRazorpayPlan};
