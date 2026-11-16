const store=require('./store');const configured=Number(process.env.FREE_DAILY_MESSAGES||30);const DEFAULT_DAILY_LIMIT=Number.isFinite(configured)&&configured>0?Math.floor(configured):30;const reservations=new Map();
function dayKey(d=new Date()){return d.toISOString().slice(0,10);}
async function getDailyUsage(userId,date=new Date()){return (await store.usageStats(userId,dayKey(date))).used;}
async function assertCanSend(userId){const slot=await store.reserveUsageSlot(userId,DEFAULT_DAILY_LIMIT,dayKey());reservations.set(slot.reservationId,userId);return {...slot,limit:DEFAULT_DAILY_LIMIT};}
async function releaseReservation(userId){const entries=[...reservations.entries()].filter(([,owner])=>owner===userId);const id=entries.at(-1)?.[0];if(id){reservations.delete(id);await store.releaseUsageSlot(id);}}
async function recordUsage({userId,botId,provider,model,inputTokens=0,outputTokens=0}){const record={id:require('crypto').randomUUID(),userId,botId,provider,model,inputTokens,outputTokens,day:dayKey(),createdAt:new Date().toISOString()};const id=[...reservations.entries()].find(([,owner])=>owner===userId)?.[0];if(id)reservations.delete(id);await store.commitUsageRecord(record,id);return record;}
async function usageSummary(userId){const stats=await store.usageStats(userId,dayKey());return {used:stats.used,limit:DEFAULT_DAILY_LIMIT,remaining:Math.max(0,DEFAULT_DAILY_LIMIT-stats.used-stats.pending),pending:stats.pending,resetAt:new Date(new Date().setUTCHours(24,0,0,0)).toISOString()};}
module.exports={assertCanSend,releaseReservation,recordUsage,usageSummary};
