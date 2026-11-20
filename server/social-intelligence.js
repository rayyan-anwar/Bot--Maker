'use strict';

const crypto=require('node:crypto');
const {v4:uuidv4}=require('uuid');
const store=require('./store');
const STATE_TTL_MS=10*60*1000;
const MAX_PENDING_STATES=10000;
const PLATFORMS=Object.freeze({
 instagram:{label:'Instagram',env:'BOTFORGE_INSTAGRAM_CLIENT_ID',capabilities:['profile','insights','media.read'],requiresAppReview:true},
 youtube:{label:'YouTube',env:'BOTFORGE_YOUTUBE_CLIENT_ID',capabilities:['profile','analytics','videos.read'],requiresAppReview:true},
 linkedin:{label:'LinkedIn',env:'BOTFORGE_LINKEDIN_CLIENT_ID',capabilities:['profile','organization.read'],requiresAppReview:true}
});
function getPlatforms(){
 return Object.entries(PLATFORMS).map(([id,p])=>({id,label:p.label,configured:!!process.env[p.env],capabilities:[...p.capabilities],publishingAvailable:false,liveOAuthAvailable:false,requiresAppReview:p.requiresAppReview}));
}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function tokenEncryptionKey(){
 const encoded=process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY;
 if(typeof encoded!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw new Error('BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
 const key=Buffer.from(encoded,'base64');
 if(key.length!==32||key.toString('base64')!==encoded)throw new Error('BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
 return key;
}
function encryptToken(token){
 if(typeof token!=='string'||!token||token.length>16384)throw new TypeError('A non-empty token of at most 16384 characters is required.');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',tokenEncryptionKey(),iv);
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return {version:1,algorithm:'A256GCM',iv:iv.toString('base64url'),ciphertext:ciphertext.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};
}
function decryptToken(envelope){
 if(!envelope||envelope.version!==1||envelope.algorithm!=='A256GCM'||typeof envelope.iv!=='string'||typeof envelope.ciphertext!=='string'||typeof envelope.tag!=='string')throw new TypeError('Invalid encrypted token envelope.');
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenEncryptionKey(),Buffer.from(envelope.iv,'base64url'));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]).toString('utf8');
 }catch(_){throw new Error('Unable to decrypt social token envelope. Check the encryption key and stored data.');}
}
function createPkcePair(){
 const verifier=crypto.randomBytes(32).toString('base64url');
 const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 return {verifier,challenge,method:'S256'};
}
async function createOAuthState(userId,platform,now=new Date()){
 if(typeof userId!=='string'||!userId.trim()||userId.length>128)throw new TypeError('A valid authenticated user ID is required.');
 if(!Object.prototype.hasOwnProperty.call(PLATFORMS,platform))throw new TypeError('Unsupported social platform.');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('A valid creation time is required.');
 const existing=await store.findManyAsync('socialOAuthStates');
 const expired=existing.filter(row=>!row.expiresAt||Date.parse(row.expiresAt)<=now.getTime());
 for(const row of expired)await store.deleteByIdAsync('socialOAuthStates',row.id);
 if(existing.length-expired.length>=MAX_PENDING_STATES)throw new Error('Too many pending social authorization attempts.');
 const state=crypto.randomBytes(32).toString('base64url'),pkce=createPkcePair(),expiresAt=new Date(now.getTime()+STATE_TTL_MS);
 await store.insertAsync('socialOAuthStates',{id:uuidv4(),stateHash:hash(state),userId,platform,codeVerifier:pkce.verifier,createdAt:now.toISOString(),expiresAt:expiresAt.toISOString()});
 return {state,codeChallenge:pkce.challenge,codeChallengeMethod:pkce.method,expiresAt:expiresAt.toISOString()};
}
async function consumeOAuthState(state,userId,platform,now=new Date()){
 if(typeof state!=='string'||state.length!==43||typeof userId!=='string'||!(now instanceof Date)||!Number.isFinite(now.getTime()))return null;
 const record=await store.consumeSocialOAuthState(hash(state),userId,platform,now);
 if(!record)return null;
 return {userId:record.userId,platform:record.platform,codeVerifier:record.codeVerifier};
}
module.exports={PLATFORMS,getPlatforms,createOAuthState,consumeOAuthState,createPkcePair,encryptToken,decryptToken,STATE_TTL_MS};
