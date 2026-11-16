const store=require('./store');

const configuredLimit=Number(process.env.FREE_DAILY_MESSAGES || 30);
const DEFAULT_DAILY_LIMIT=Number.isFinite(configuredLimit)&&configuredLimit>0?Math.floor(configuredLimit):30;
// Process-local reservations close the concurrent-request quota race for a
// single instance. Production multi-instance deployments must use Redis/DB locks.
const pendingByUser=new Map();
function dayKey(date=new Date()) { return date.toISOString().slice(0,10); }
function getDailyUsage(userId,date=new Date()) {
  const key=dayKey(date);
  return store.all('usage').filter(x=>x.userId===userId && x.day===key).reduce((sum,x)=>sum+1,0);
}
function assertCanSend(userId) {
  const limit=DEFAULT_DAILY_LIMIT;
  const used=getDailyUsage(userId);
  const pending=pendingByUser.get(userId)||0;
  if(used+pending>=limit) {
    const error=new Error('Daily message limit reached. Try again after the daily reset.');
    error.status=429;
    throw error;
  }
  pendingByUser.set(userId,pending+1);
  return {used,limit,remaining:Math.max(0,limit-used-pending-1)};
}
function releaseReservation(userId) {
  const pending=pendingByUser.get(userId)||0;
  if(pending<=1)pendingByUser.delete(userId);
  else pendingByUser.set(userId,pending-1);
}
function recordUsage({userId,botId,provider,model,inputTokens=0,outputTokens=0}) {
  const record={id:require('crypto').randomUUID(),userId,botId,provider,model,inputTokens,outputTokens,day:dayKey(),createdAt:new Date().toISOString()};
  store.insert('usage',record);
  releaseReservation(userId);
  return record;
}
function usageSummary(userId) {
  const used=getDailyUsage(userId);
  const pending=pendingByUser.get(userId)||0;
  return {used,limit:DEFAULT_DAILY_LIMIT,remaining:Math.max(0,DEFAULT_DAILY_LIMIT-used-pending),pending,resetAt:new Date(new Date().setUTCHours(24,0,0,0)).toISOString()};
}
module.exports={assertCanSend,releaseReservation,recordUsage,usageSummary};
