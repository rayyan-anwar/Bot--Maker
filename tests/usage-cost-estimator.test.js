const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizePricing,estimateCost,reserveEstimate}=require('../server/usage-cost-estimator');

test('normalizes explicit model price and version',()=>assert.deepEqual(normalizePricing({inputPerMillion:1.5,outputPerMillion:4,currency:'inr',version:'test-v1'}),{inputPerMillion:1.5,outputPerMillion:4,currency:'INR',version:'test-v1'}));
test('rejects missing pricing without claiming zero cost',()=>assert.equal(estimateCost({inputTokens:100,outputTokens:50,pricing:null}).known,false));
test('rejects negative prices',()=>assert.equal(normalizePricing({inputPerMillion:-1,outputPerMillion:1}),null));
test('calculates estimated input and output cost',()=>assert.deepEqual(estimateCost({inputTokens:200000,outputTokens:50000,pricing:{inputPerMillion:2,outputPerMillion:8,currency:'USD',version:'v1'}}),{known:true,cost:0.8,currency:'USD',pricingVersion:'v1'}));
test('rejects noninteger token counts',()=>assert.equal(estimateCost({inputTokens:1.5,outputTokens:0,pricing:{inputPerMillion:1,outputPerMillion:1}}).known,false));
test('reserves estimate from maximum token caps',()=>assert.deepEqual(reserveEstimate({maxInputTokens:1000000,maxOutputTokens:1000000,pricing:{inputPerMillion:1,outputPerMillion:2,currency:'USD'}}),{known:true,cost:3,currency:'USD',pricingVersion:'unversioned'}));
