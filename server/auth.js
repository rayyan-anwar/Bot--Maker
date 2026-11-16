const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {v4:uuidv4}=require('uuid');
const store=require('./store');
const router=express.Router(),JWT_SECRET=process.env.JWT_SECRET,COOKIE_NAME='session',TOKEN_TTL='30d';
function publicUser(u){return {id:u.id,email:u.email,name:u.name};}
function isValidEmail(e){return typeof e==='string'&&e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}
function cookieOptions(){return {httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:30*24*60*60*1000,path:'/'};}
async function getUserFromRequest(req){const token=req.cookies&&req.cookies[COOKIE_NAME];if(!token)return null;try{const p=jwt.verify(token,JWT_SECRET);return await store.findByIdAsync('users',p.userId);}catch(_){return null;}}
function requireAuth(req,res,next){getUserFromRequest(req).then(user=>{if(!user)return res.status(401).json({error:'Please log in first.'});req.user=user;next();}).catch(next);}
router.post('/signup',async(req,res,next)=>{try{const {email,password,name}=req.body||{};if(!isValidEmail(email))return res.status(400).json({error:'Enter a valid email address.'});if(typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'Password must be between 12 and 128 characters.'});if(typeof name!=='string'||!name.trim()||name.trim().length>80)return res.status(400).json({error:'Enter a name up to 80 characters.'});const normalized=email.trim().toLowerCase();if((await store.allAsync('users')).some(u=>u.email===normalized))return res.status(409).json({error:'An account with that email already exists.'});const user={id:uuidv4(),email:normalized,name:name.trim(),passwordHash:await bcrypt.hash(password,12),createdAt:new Date().toISOString()};await store.insertAsync('users',user);res.cookie(COOKIE_NAME,jwt.sign({userId:user.id},JWT_SECRET,{expiresIn:TOKEN_TTL}),cookieOptions());res.status(201).json({user:publicUser(user)});}catch(e){next(e);}});
router.post('/login',async(req,res,next)=>{try{const {email,password}=req.body||{};if(!isValidEmail(email)||typeof password!=='string'||password.length>128)return res.status(401).json({error:'Incorrect email or password.'});const normalized=email.trim().toLowerCase(),user=(await store.allAsync('users')).find(u=>u.email===normalized);if(!user||!await bcrypt.compare(password,user.passwordHash))return res.status(401).json({error:'Incorrect email or password.'});res.cookie(COOKIE_NAME,jwt.sign({userId:user.id},JWT_SECRET,{expiresIn:TOKEN_TTL}),cookieOptions());res.json({user:publicUser(user)});}catch(e){next(e);}});
router.post('/logout',(req,res)=>{res.clearCookie(COOKIE_NAME,cookieOptions());res.json({ok:true});});
router.get('/me',async(req,res,next)=>{try{const user=await getUserFromRequest(req);if(!user)return res.status(401).json({error:'Not logged in.'});res.json({user:publicUser(user)});}catch(e){next(e);}});
module.exports={router,requireAuth,getUserFromRequest,publicUser};
