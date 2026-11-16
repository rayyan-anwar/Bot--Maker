const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {v4:uuidv4}=require('uuid');
const store=require('./store');
const router=express.Router(),JWT_SECRET=process.env.JWT_SECRET,COOKIE_NAME='session',TOKEN_TTL='8h',MAX_FAILED_LOGINS=3;
function adminEmail(){return String(process.env.BOTFORGE_ADMIN_EMAIL||'').trim().toLowerCase();}
function isAdminEmail(email){return !!adminEmail()&&String(email||'').trim().toLowerCase()===adminEmail();}
function publicUser(u){return {id:u.id,email:u.email,name:u.name,role:isAdminEmail(u.email)?'admin':'user',plan:u.plan||'free'};}

const crypto=require('node:crypto');
function oauthCookieOptions(){return {httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:10*60*1000,path:'/api/auth/oauth'};}
function oauthConfig(provider){
 if(provider==='google')return {clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,redirectUri:process.env.GOOGLE_OAUTH_REDIRECT_URI,authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token'};
 if(provider==='github')return {clientId:process.env.GITHUB_CLIENT_ID,clientSecret:process.env.GITHUB_CLIENT_SECRET,redirectUri:process.env.GITHUB_OAUTH_REDIRECT_URI,authorize:'https://github.com/login/oauth/authorize',token:'https://github.com/login/oauth/access_token'};
 return null;
}
function oauthFailure(res,code){return res.redirect('/?oauth_error='+encodeURIComponent(code));}
async function fetchJson(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});let data={};try{data=await r.json()}catch(_){}if(!r.ok)throw new Error('OAuth provider request failed.');return data;}
async function oauthProfile(provider,accessToken){
 if(provider==='google'){
  const p=await fetchJson('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+accessToken}});
  if(!p.sub||!p.email||p.email_verified!==true)throw new Error('Google account did not provide a verified email.');
  return {id:String(p.sub),email:String(p.email).trim().toLowerCase(),name:String(p.name||p.given_name||'Google user').slice(0,80)};
 }
 const p=await fetchJson('https://api.github.com/user',{headers:{authorization:'Bearer '+accessToken,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}});
 if(!p.id)throw new Error('GitHub account identity is unavailable.');
 const emails=await fetchJson('https://api.github.com/user/emails',{headers:{authorization:'Bearer '+accessToken,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}});
 const primary=(Array.isArray(emails)?emails:[]).find(e=>e.primary&&e.verified&&isValidEmail(e.email));
 if(!primary)throw new Error('GitHub account must have a verified primary email.');
 return {id:String(p.id),email:primary.email.trim().toLowerCase(),name:String(p.name||p.login||'GitHub user').slice(0,80)};
}
router.get('/oauth/:provider',async(req,res,next)=>{
 try{
  const provider=String(req.params.provider||'').toLowerCase(),cfg=oauthConfig(provider);
  if(!cfg||!cfg.clientId||!cfg.clientSecret||!cfg.redirectUri)return res.status(503).send('This sign-in provider is not configured.');
  const state=crypto.randomBytes(32).toString('hex'),cookieName='oauth_'+provider+'_state';
  res.cookie(cookieName,jwt.sign({state,provider},JWT_SECRET,{expiresIn:'10m'}),oauthCookieOptions());
  const params=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,state});
  if(provider==='google'){params.set('response_type','code');params.set('scope','openid email profile');params.set('prompt','select_account');}
  else{params.set('scope','read:user user:email');}
  res.redirect(cfg.authorize+'?'+params.toString());
 }catch(e){next(e);}
});
router.get('/oauth/:provider/callback',async(req,res,next)=>{
 const provider=String(req.params.provider||'').toLowerCase(),cfg=oauthConfig(provider),cookieName='oauth_'+provider+'_state';
 try{
  const stateCookie=req.cookies&&req.cookies[cookieName];res.clearCookie(cookieName,{...oauthCookieOptions(),maxAge:0});
  if(!cfg||!cfg.clientId||!cfg.clientSecret||!cfg.redirectUri)return oauthFailure(res,'provider_not_configured');
  if(req.query.error||typeof req.query.code!=='string'||typeof req.query.state!=='string'||!stateCookie)return oauthFailure(res,'oauth_cancelled_or_invalid');
  let statePayload;try{statePayload=jwt.verify(stateCookie,JWT_SECRET);}catch(_){return oauthFailure(res,'state_expired');}
  if(statePayload.provider!==provider||statePayload.state!==req.query.state)return oauthFailure(res,'state_mismatch');
  const params=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,code:req.query.code,redirect_uri:cfg.redirectUri});
  if(provider==='google')params.set('grant_type','authorization_code');
  const token=await fetchJson(cfg.token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:params.toString()});
  if(!token.access_token) return oauthFailure(res,'token_exchange_failed');
  const profile=await oauthProfile(provider,token.access_token);
  if(!isValidEmail(profile.email)||isAdminEmail(profile.email))return oauthFailure(res,'account_not_eligible');
  let user=(await store.findManyAsync('users',{email:profile.email}))[0];
  if(user){
   const linked=user.oauthProviders&&user.oauthProviders[provider];
   if(linked!==profile.id)return oauthFailure(res,'email_already_registered_sign_in_with_password');
  }else{
   user={id:uuidv4(),name:profile.name,email:profile.email,passwordHash:null,oauthProviders:{[provider]:profile.id},plan:'free',failedLoginAttempts:0,lockedAt:null,emailVerified:true,createdAt:new Date().toISOString()};
   await store.insertAsync('users',user);
  }
  if(user.lockedAt)return oauthFailure(res,'account_locked_contact_support');
  await store.updateByIdAsync('users',user.id,{lastLoginAt:new Date().toISOString()});
  res.cookie(COOKIE_NAME,jwt.sign({userId:user.id},JWT_SECRET,{expiresIn:TOKEN_TTL}),cookieOptions());
  return res.redirect('/dashboard.html');
 }catch(e){return oauthFailure(res,'oauth_sign_in_failed');}
});

function isValidEmail(e){return typeof e==='string'&&e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}
function cookieOptions(){return {httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000,path:'/'};}
async function getUserFromRequest(req){const token=req.cookies&&req.cookies[COOKIE_NAME];if(!token)return null;try{const p=jwt.verify(token,JWT_SECRET);const user=await store.findByIdAsync('users',p.userId);if(!user||user.lockedAt)return null;return user;}catch(_){return null;}}
function requireAuth(req,res,next){getUserFromRequest(req).then(user=>{if(!user)return res.status(401).json({error:'Sign in to continue.'});req.user=user;next();}).catch(next);}
router.post('/signup',async(req,res,next)=>{try{const {name,email,password}=req.body||{};const normalized=String(email||'').trim().toLowerCase();if(typeof name!=='string'||!name.trim()||name.trim().length>80||!isValidEmail(normalized)||typeof password!=='string'||password.length<10||password.length>128)return res.status(400).json({error:'Enter a valid name and email, and a password of 10–128 characters.'});if(isAdminEmail(normalized))return res.status(409).json({error:'This email is reserved for the platform administrator.'});if((await store.findManyAsync('users',{email:normalized}))[0])return res.status(409).json({error:'An account with this email already exists.'});const user={id:uuidv4(),name:name.trim(),email:normalized,passwordHash:await bcrypt.hash(password,12),plan:'free',failedLoginAttempts:0,lockedAt:null,createdAt:new Date().toISOString()};await store.insertAsync('users',user);res.cookie(COOKIE_NAME,jwt.sign({userId:user.id},JWT_SECRET,{expiresIn:TOKEN_TTL}),cookieOptions());res.status(201).json({user:publicUser(user)});}catch(e){if(e.code==='23505')return res.status(409).json({error:'An account with this email already exists.'});next(e);}});
router.post('/login',async(req,res,next)=>{try{const {email,password}=req.body||{};if(!isValidEmail(email)||typeof password!=='string'||password.length>128)return res.status(401).json({error:'Incorrect email or password.'});const normalized=email.trim().toLowerCase(),user=(await store.findManyAsync('users',{email:normalized}))[0];if(!user)return res.status(401).json({error:'Incorrect email or password.'});if(user.lockedAt)return res.status(423).json({error:'Account locked after 3 failed attempts. Contact support or the administrator for a password reset.'});if(!user.passwordHash||!await bcrypt.compare(password,user.passwordHash)){const attempts=Math.min(MAX_FAILED_LOGINS,Number(user.failedLoginAttempts||0)+1),patch={failedLoginAttempts:attempts,...(attempts>=MAX_FAILED_LOGINS?{lockedAt:new Date().toISOString()}: {})};await store.updateByIdAsync('users',user.id,patch);return res.status(attempts>=MAX_FAILED_LOGINS?423:401).json({error:attempts>=MAX_FAILED_LOGINS?'Account locked after 3 failed attempts. Contact support or the administrator for a password reset.':'Incorrect email or password. '+(MAX_FAILED_LOGINS-attempts)+' attempts remaining.'});}await store.updateByIdAsync('users',user.id,{failedLoginAttempts:0,lockedAt:null,lastLoginAt:new Date().toISOString()});res.cookie(COOKIE_NAME,jwt.sign({userId:user.id},JWT_SECRET,{expiresIn:TOKEN_TTL}),cookieOptions());res.json({user:publicUser(user)});}catch(e){next(e);}});
router.post('/logout',(req,res)=>{res.clearCookie(COOKIE_NAME,cookieOptions());res.json({ok:true});});
router.get('/me',async(req,res,next)=>{try{const user=await getUserFromRequest(req);if(!user)return res.status(401).json({error:'Not signed in.'});res.json({user:publicUser(user)});}catch(e){next(e);}});
module.exports={router,requireAuth,getUserFromRequest,publicUser,isAdminEmail,MAX_FAILED_LOGINS};
