const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','public','dashboard.html'),'utf8');

test('Bot Studio wizard has three complete steps and unique field IDs',()=>{
 const markers=[0,1,2].map(n=>html.indexOf('data-wizard-step="'+n+'"'));
 assert.ok(markers.every(index=>index>=0));
 assert.ok(markers[0]<markers[1]&&markers[1]<markers[2]);
 const steps=markers.map((start,index)=>html.slice(start,index===2?html.indexOf('</form>',start):markers[index+1]));
 const wizardIds=['bot-name','bot-purpose','bot-audience','bot-provider','bot-instructions','bot-welcome','bot-public','bot-preview'];
 assert.equal(wizardIds.length,new Set(wizardIds).size,'Wizard field IDs must be unique');
 for(const id of ['bot-name','bot-purpose','bot-audience'])assert.ok(steps[0].includes('id="'+id+'"'),id);
 for(const id of ['bot-provider','bot-instructions'])assert.ok(steps[1].includes('id="'+id+'"'),id);
 for(const id of ['bot-welcome','bot-public','bot-preview'])assert.ok(steps[2].includes('id="'+id+'"'),id);
});

test('Bot Studio wizard exposes progress, navigation, and final create controls',()=>{
 for(const id of ['wizard-progress','wizard-progress-bar','wizard-back','wizard-next','wizard-create','cancel-new-bot','new-bot-error']) {
  assert.ok(html.includes('id="'+id+'"'),id);
 }
});


test('saved bot version snapshots reject malformed or unsupported configurations',()=>{
 const {validateBotSnapshot}=require('../server/bots');
 const valid={name:'Support bot',instructions:'Help customers safely.',description:'Support',provider:'openai',model:null,isPublic:false,purpose:'Support',audience:'Customers',welcomeMessage:'How can I help?',temperature:0.7,maxTokens:1024,responseStyle:'balanced',safetyMode:'standard'};
 assert.equal(validateBotSnapshot(valid),true);
 for(const snapshot of [null,[],{...valid,name:''},{...valid,instructions:'x'.repeat(6001)},{...valid,provider:'unknown'},{...valid,temperature:3},{...valid,maxTokens:64},{...valid,responseStyle:'unsafe'},{...valid,safetyMode:'off'},{...valid,isPublic:'yes'}])assert.equal(validateBotSnapshot(snapshot),false);
});


test('Bot Studio dashboard exposes owner publish and unpublish controls',()=>{
 assert.match(html,/class="bot-publish-toggle"/);
 assert.match(html,/data-published=/);
 assert.match(html,/api\('\/bots\/'\+encodeURIComponent\(id\)\+\'\/\'/);
 assert.match(html,/async function loadPublicBots\\(append=false\\)/);
});

test('Bot Studio dashboard exposes version history and restore actions for owned bots',()=>{
 assert.match(html,/bot-version-toggle/);
 assert.match(html,/bot-version-panel/);
 assert.match(html,/bot-version-restore/);
 assert.ok(html.includes("api('/bots/'+encodeURIComponent(botId)+'/versions')"));
 assert.ok(html.includes("/versions/'+encodeURIComponent(restoreButton.dataset.version)+'/restore"));
 assert.match(html,/data-current-version|Current version:/);
});
test('Bot Studio version history uses DOM text APIs for saved summaries',()=>{
 assert.ok(html.includes("label.textContent='Version '+version.version"));
 assert.ok(html.includes("detail.textContent=' · '+version.summary"));
 assert.match(html,/panel\.replaceChildren\(\)/);
});

test('Bot Studio public discovery exposes search, pagination and load-more controls',()=>{
 for(const id of ['public-bots-search','public-bots-search-btn','public-bots-load-more'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/PUBLIC_BOT_PAGE_SIZE=24/);
 assert.match(html,/publicBotOffset\+=PUBLIC_BOT_PAGE_SIZE/);
 assert.match(html,/encodeURIComponent\(publicBotQuery\)/);
});
