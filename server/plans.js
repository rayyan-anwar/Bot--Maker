const rawFree=Number(process.env.FREE_DAILY_MESSAGES||30);
const defaults={free:{dailyMessages:Number.isFinite(rawFree)&&rawFree>0?Math.floor(rawFree):30},plus:{dailyMessages:500},pro:{dailyMessages:2000}};
function getPlans(){if(!process.env.BOTFORGE_PLANS_JSON)return defaults;try{const parsed=JSON.parse(process.env.BOTFORGE_PLANS_JSON);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return defaults;const safe={};for(const [name,plan] of Object.entries(parsed)){if(!/^[a-z0-9_-]{1,32}$/.test(name)||!plan||!Number.isInteger(plan.dailyMessages)||plan.dailyMessages<1||plan.dailyMessages>1000000)continue;safe[name]={dailyMessages:plan.dailyMessages};}return safe.free?safe:defaults;}catch(_){return defaults;}}
function getPlanName(user){const plans=getPlans();return user&&typeof user.plan==='string'&&plans[user.plan]?user.plan:'free';}
function getDailyLimit(user){return getPlans()[getPlanName(user)].dailyMessages;}
module.exports={getPlans,getPlanName,getDailyLimit};
