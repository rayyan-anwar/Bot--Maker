const store=require('./store');const configured=Number(process.env.FREE_DAILY_MESSAGES||30);const DEFAULT_DAILY_LIMIT=Number.isFinite(configured)&&configured>0?Math.floor(configured):30;
function dayKey(d=new Date()){return d.toISOString().slice(0,10);}
async function getDailyUsage(userId,date=new Date()){return (await store.usageStats(userId,dayKey(date))).used;}
async function assertCanSend(userId){const slot=await store.reserveUsageSlot(userId,DEFAULT_DAILY_LIMIT,dayKey());return {...slot,limit:DEFAULT_DAILY_LIMIT};}
async function releaseReservation(reservationId){await store.releaseUsageSlot(reservationId);}
async function recordUsage({userId,botId,provider,model,inputTokens=0,outputTokens=0,reservationId}){const record={id:require('crypto').randomUUID(),userId,botId,provider,model,inputTokens,outputTokens,day:dayKey(),createdAt:new Date().toISOString()};await store.commitUsageRecord(record,reservationId);return record;}
async function usageSummary(userId){const stats=await store.usageStats(userId,dayKey());return {used:stats.used,limit:DEFAULT_DAILY_LIMIT,remaining:Math.max(0,DEFAULT_DAILY_LIMIT-stats.used-stats.pending),pending:stats.pending,resetAt:new Date(new Date().setUTCHours(24,0,0,0)).toISOString()};}
module.exports={assertCanSend,releaseReservation,recordUsage,usageSummary};
