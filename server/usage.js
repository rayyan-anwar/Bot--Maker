const store=require('./store');const plans=require('./plans');const {reserveEstimate,estimateCost}=require('./usage-cost-estimator');const {v4:uuidv4}=require('uuid');
function dayKey(d=new Date()){return d.toISOString().slice(0,10);}
async function getDailyUsage(userId,date=new Date()){return (await store.usageStats(userId,dayKey(date))).used;}
async function assertCanSend(userId){const user=await store.findByIdAsync('users',userId);if(!user)throw new Error('Account not found.');const limit=plans.getDailyLimit(user),slot=await store.reserveUsageSlot(userId,limit,dayKey());return {...slot,limit,plan:plans.getPlanName(user)};}
async function releaseReservation(reservationId){await store.releaseUsageSlot(reservationId);}
async function recordUsage({userId,botId,provider,model,inputTokens=0,outputTokens=0,reservationId}){const record={id:require('crypto').randomUUID(),userId,botId,provider,model,inputTokens,outputTokens,day:dayKey(),createdAt:new Date().toISOString()};await store.commitUsageRecord(record,reservationId);return record;}
async function reserveAiBudget({provider,model,system,messages,maxTokens=1024}){
 if(process.env.BOTFORGE_AI_BUDGET_ENABLED!=='true')return null;
 if(!store.isPostgres())throw Object.assign(new Error('AI budget enforcement requires PostgreSQL storage.'),{status:503});
 const scopeId=String(process.env.BOTFORGE_AI_BUDGET_SCOPE_ID||'').trim();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scopeId))throw Object.assign(new Error('AI budget scope is not configured.'),{status:503});
 let pricingMap;
 try{pricingMap=JSON.parse(process.env.BOTFORGE_AI_PRICING_JSON||'{}');}catch(_){throw Object.assign(new Error('AI model pricing configuration is invalid.'),{status:503});}
 const modelId=String(model||'').trim();
 const pricing=pricingMap[provider+':'+modelId];
 if(!pricing)throw Object.assign(new Error('Pricing is not configured for the selected AI model. Request blocked.'),{status:503});
 const scope=await store.query('SELECT currency FROM ai_budget_scopes WHERE id=$1::uuid',[scopeId]);
 if(!scope.rowCount)throw Object.assign(new Error('Configured AI budget scope does not exist.'),{status:503});
 const normalizedCurrency=String(pricing.currency||'USD').trim().toUpperCase();
 if(scope.rows[0].currency.trim()!==normalizedCurrency)throw Object.assign(new Error('AI pricing currency does not match the configured budget scope.'),{status:503});
 // Tokenization is provider/model-specific. Use a 4x character allowance as a
 // deliberately conservative preflight ceiling; actual usage settles the hold.
 const inputTokenCap=[system,...(messages||[]).map(m=>m.content||'')].reduce((n,value)=>n+String(value).length,0)*4;
 if(!Number.isSafeInteger(inputTokenCap)||!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>32768)throw Object.assign(new Error('AI request token allowance is invalid.'),{status:400});
 const estimate=reserveEstimate({maxInputTokens:inputTokenCap,maxOutputTokens:maxTokens,pricing});
 if(!estimate.known||!Number.isFinite(estimate.cost))throw Object.assign(new Error('AI request cost cannot be estimated safely. Request blocked.'),{status:503});
 const requestKey=uuidv4(),expiresAt=new Date(Date.now()+15*60*1000).toISOString();
 const result=await store.query('SELECT botforge_reserve_ai_budget($1,$2::uuid,$3,$4,$5,$6,$7::numeric,$8::timestamptz) AS id',
  [requestKey,scopeId,provider+':'+modelId,pricing.version,inputTokenCap,maxTokens,estimate.cost,expiresAt]);
 return {reservationId:result.rows[0].id,requestKey,scopeId,provider,model:modelId,pricing,maxTokens};
}
async function settleAiBudget(reservation,result){
 if(!reservation)return null;
 const actual=estimateCost({inputTokens:result.inputTokens,outputTokens:result.outputTokens,pricing:reservation.pricing});
 if(!actual.known)throw new Error('Actual AI usage could not be priced; budget reservation remains open for reconciliation.');
 const settled=await store.query('SELECT botforge_settle_ai_budget($1::uuid,$2::numeric,$3) AS state',
  [reservation.reservationId,actual.cost,result.providerRequestId||null]);
 return settled.rows[0].state;
}
async function releaseAiBudget(reservation){
 if(!reservation)return null;
 const released=await store.query('SELECT botforge_release_ai_budget($1::uuid,FALSE) AS state',[reservation.reservationId]);
 return released.rows[0].state;
}
async function usageSummary(userId){const user=await store.findByIdAsync('users',userId);if(!user)throw new Error('Account not found.');const stats=await store.usageStats(userId,dayKey()),limit=plans.getDailyLimit(user);return {plan:plans.getPlanName(user),used:stats.used,limit,remaining:Math.max(0,limit-stats.used-stats.pending),pending:stats.pending,resetAt:new Date(new Date().setUTCHours(24,0,0,0)).toISOString()};}
module.exports={assertCanSend,releaseReservation,recordUsage,usageSummary,reserveAiBudget,settleAiBudget,releaseAiBudget};
