const store=require('./store');

const DEFAULT_DAILY_LIMIT=Math.max(1,Number(process.env.FREE_DAILY_MESSAGES || 30));
function dayKey(date=new Date()) { return date.toISOString().slice(0,10); }
function getDailyUsage(userId,date=new Date()) {
  const key=dayKey(date);
  return store.all('usage').filter(x=>x.userId===userId && x.day===key).reduce((sum,x)=>sum+1,0);
}
function assertCanSend(userId) {
  const limit=DEFAULT_DAILY_LIMIT;
  const used=getDailyUsage(userId);
  if(used>=limit) {
    const error=new Error('Daily message limit reached. Try again after the daily reset.');
    error.status=429;
    throw error;
  }
  return {used,limit,remaining:limit-used};
}
function recordUsage({userId,botId,provider,model,inputTokens=0,outputTokens=0}) {
  const record={id:require('crypto').randomUUID(),userId,botId,provider,model,inputTokens,outputTokens,day:dayKey(),createdAt:new Date().toISOString()};
  store.insert('usage',record);
  return record;
}
function usageSummary(userId) {
  const used=getDailyUsage(userId);
  return {used,limit:DEFAULT_DAILY_LIMIT,remaining:Math.max(0,DEFAULT_DAILY_LIMIT-used),resetAt:new Date(new Date().setUTCHours(24,0,0,0)).toISOString()};
}
module.exports={assertCanSend,recordUsage,usageSummary};
