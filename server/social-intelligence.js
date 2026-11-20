'use strict';

const crypto=require('node:crypto');
const STATE_TTL_MS=10*60*1000;
const MAX_PENDING_STATES=10000;
const pending=new Map();
const PLATFORMS=Object.freeze({
 instagram:{label:'Instagram',env:'BOTFORGE_INSTAGRAM_CLIENT_ID',capabilities:['profile','insights','media.read'],requiresAppReview:true},
 youtube:{label:'YouTube',env:'BOTFORGE_YOUTUBE_CLIENT_ID',capabilities:['profile','analytics','videos.read'],requiresAppReview:true},
 linkedin:{label:'LinkedIn',env:'BOTFORGE_LINKEDIN_CLIENT_ID',capabilities:['profile','organization.read'],requiresAppReview:true}
});
function getPlatforms(){
 return Object.entries(PLATFORMS).map(([id,p])=>({id,label:p.label,configured:!!process.env[p.env],capabilities:[...p.capabilities],publishingAvailable:false,liveOAuthAvailable:false,requiresAppReview:p.requiresAppReview}));
}
function createOAuthState(userId,platform,now=Date.now()){
 if(typeof userId!=='string'||!userId.trim()||userId.length>128)throw new TypeError('A valid authenticated user ID is required.');
 if(!Object.prototype.hasOwnProperty.call(PLATFORMS,platform))throw new TypeError('Unsupported social platform.');
 if(pending.size>=MAX_PENDING_STATES)for(const [key,value] of pending)if(value.expiresAt<=now)pending.delete(key);
 if(pending.size>=MAX_PENDING_STATES)throw new Error('Too many pending social authorization attempts.');
 const state=crypto.randomBytes(32).toString('base64url');
 pending.set(state,{userId,platform,createdAt:now,expiresAt:now+STATE_TTL_MS});
 return {state,expiresAt:now+STATE_TTL_MS};
}
function consumeOAuthState(state,userId,platform,now=Date.now()){
 if(typeof state!=='string'||state.length!==43||typeof userId!=='string')return false;
 const record=pending.get(state);
 if(!record)return false;
 pending.delete(state);
 return record.expiresAt>now&&record.userId===userId&&record.platform===platform;
}
function pendingStateCount(){return pending.size;}
function clearExpiredStates(now=Date.now()){
 let removed=0;for(const [key,value] of pending)if(value.expiresAt<=now){pending.delete(key);removed++;}
 return removed;
}
module.exports={PLATFORMS,getPlatforms,createOAuthState,consumeOAuthState,pendingStateCount,clearExpiredStates,STATE_TTL_MS};
