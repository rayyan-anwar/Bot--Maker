const store=require('./store');const plans=require('./plans');
function dayKey(d=new Date()){return d.toISOString().slice(0,10);}
async function getDailyUsage(userId,date=new Date()){return (await store.usageStats(userId,dayKey(date))).used;}
async function assertCanSend(userId){const user=await store.findByIdAsync('users',userId);if(!user)throw new Error('Account not found.');const limit=plans.getDailyLimit(user),slot=await store.reserveUsageSlot(userId,limit,dayKey());return {...slot,limit,plan:plans.getPlanName(user)};}
async function releaseReservation(reservationId){await store.releaseUsageSlot(reservationId);}
async function recordUsage({userId,botId,provider,model,inputTokens=0,outputTokens=0,reservationId}){const record={id:require('crypto').randomUUID(),userId,botId,provider,model,inputTokens,outputTokens,day:dayKey(),createdAt:new Date().toISOString()};await store.commitUsageRecord(record,reservationId);return record;}
async function usageSummary(userId){const user=await store.findByIdAsync('users',userId);if(!user)throw new Error('Account not found.');const stats=await store.usageStats(userId,dayKey()),limit=plans.getDailyLimit(user);return {plan:plans.getPlanName(user),used:stats.used,limit,remaining:Math.max(0,limit-stats.used-stats.pending),pending:stats.pending,resetAt:new Date(new Date().setUTCHours(24,0,0,0)).toISOString()};}
module.exports={assertCanSend,releaseReservation,recordUsage,usageSummary};
