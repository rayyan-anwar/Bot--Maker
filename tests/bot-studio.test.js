const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','public','dashboard.html'),'utf8');

test('Bot Studio wizard has three complete steps and unique field IDs',()=>{
 const steps=[...html.matchAll(/<section class="wizard-step" data-wizard-step="(\\d+)"[\\s\\S]*?<\\/section>/g)];
 assert.deepEqual(steps.map(match=>match[1]),['0','1','2']);
 const ids=[...html.matchAll(/\\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,new Set(ids).size,'Dashboard element IDs must be unique');
 const identity=steps.find(match=>match[1]==='0')[0];
 const intelligence=steps.find(match=>match[1]==='1')[0];
 const access=steps.find(match=>match[1]==='2')[0];
 assert.match(identity,/id="bot-name"/);
 assert.match(identity,/id="bot-purpose"/);
 assert.match(identity,/id="bot-audience"/);
 assert.match(intelligence,/id="bot-provider"/);
 assert.match(intelligence,/id="bot-instructions"/);
 assert.match(access,/id="bot-welcome"/);
 assert.match(access,/id="bot-public"/);
 assert.match(access,/id="bot-preview"/);
});

test('Bot Studio wizard exposes progress, navigation, and final create controls',()=>{
 for(const id of ['wizard-progress','wizard-progress-bar','wizard-back','wizard-next','wizard-create','cancel-new-bot','new-bot-error']) {
  assert.match(html,new RegExp('id="'+id+'"'));
 }
});
