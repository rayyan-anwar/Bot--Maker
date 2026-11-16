const express=require('express');
const crypto=require('node:crypto');
const store=require('./store');
const plans=require('./plans');
const {requireAuth}=require('./auth');
const router=express.Router(),webhookRouter=express.Router();
function signatureValid(raw,header,secret){
 if(!Buffer.isBuffer(raw)||typeof header!=='string'||!secret)return false;
 const parts=Object.fromEntries(header.split(',').map(part=>part.split('=').map(x=>x.trim())));
 const timestamp=Number(parts.t),signature=parts.v1;
 if(!Number.isFinite(timestamp)||!signature||Math.abs(Date.now()/1000-timestamp)>300)return false;
 const expected=crypto.createHmac('sha256',secret).update(String(timestamp)+'.').update(raw).digest('hex');
 const a=Buffer.from(expected,'hex'),b=Buffer.from(signature,'hex');
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
router.get('/plans',requireAuth,async(req,res,next)=>{try{const user=await store.findByIdAsync('users',req.user.id);res.json({plans:plans.getPlans(),currentPlan:plans.getPlanName(user)});}catch(e){next(e);}});
router.post('/checkout',requireAuth,async(req,res,next)=>{try{
 const {plan}=req.body||{},available=plans.getPlans();if(req.user.stripeSubscriptionId)return res.status(409).json({error:'This account already has an active subscription. Contact support to change or cancel it.'});
 if(typeof plan!=='string'||!['plus','pro'].includes(plan)||!available[plan])return res.status(400).json({error:'Choose a paid plan.'});
 const priceId=process.env[plan==='plus'?'STRIPE_PRICE_PLUS':'STRIPE_PRICE_PRO'];
 if(!process.env.STRIPE_SECRET_KEY||!priceId||!process.env.STRIPE_SUCCESS_URL||!process.env.STRIPE_CANCEL_URL)return res.status(503).json({error:'Online billing is not configured by the service operator.'});
 const form=new URLSearchParams({mode:'subscription',success_url:process.env.STRIPE_SUCCESS_URL,cancel_url:process.env.STRIPE_CANCEL_URL,customer_email:req.user.email,client_reference_id:req.user.id,'line_items[0][price]':priceId,'line_items[0][quantity]':'1','metadata[userId]':req.user.id,'metadata[plan]':plan,'subscription_data[metadata][userId]':req.user.id,'subscription_data[metadata][plan]':plan});
 const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,'content-type':'application/x-www-form-urlencoded'},body:form});
 let data={};try{data=await response.json();}catch(_){}
 if(!response.ok||!data.url)return res.status(502).json({error:'The payment provider could not create a checkout session.'});
 res.json({checkoutUrl:data.url});
 }catch(e){next(e);}});
webhookRouter.post('/',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
 const secret=process.env.STRIPE_WEBHOOK_SECRET,header=req.get('stripe-signature');
 if(!signatureValid(req.body,header,secret))return res.status(400).json({error:'Invalid webhook signature.'});
 let event;try{event=JSON.parse(req.body.toString('utf8'));}catch(_){return res.status(400).json({error:'Invalid webhook payload.'});}
 try{
  if(event.type==='checkout.session.completed'){
   const session=event.data&&event.data.object,userId=session?.metadata?.userId,plan=session?.metadata?.plan;
   if(userId&&plans.getPlans()[plan]&&session.mode==='subscription'&&session.status==='complete'&&['paid','no_payment_required'].includes(session.payment_status)){const user=await store.findByIdAsync('users',userId);if(user)await store.updateByIdAsync('users',userId,{plan,stripeCustomerId:session.customer||null,stripeSubscriptionId:session.subscription||null});}
  }else if(event.type==='customer.subscription.deleted'){
   const subscription=event.data&&event.data.object,userId=subscription?.metadata?.userId;
   if(userId){const user=await store.findByIdAsync('users',userId);if(user)await store.updateByIdAsync('users',userId,{plan:'free',stripeSubscriptionId:null});}
  }
  return res.json({received:true});
 }catch(error){console.error('Stripe webhook processing failed:',error.message);return res.status(500).json({error:'Webhook processing failed.'});}
});
module.exports={router,webhookRouter,signatureValid};
