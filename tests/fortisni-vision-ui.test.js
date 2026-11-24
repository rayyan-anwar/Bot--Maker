'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','public','bot.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','css','fortisni.css'),'utf8');

test('Fortisni chat exposes explicit user-selected phone photo analysis',()=>{
 assert.match(html,/id="fortisni-vision-form"/);
 assert.match(html,/capture="environment"/);
 assert.match(html,/accept="image\/jpeg,image\/png,image\/webp"/);
 assert.match(html,/Nothing is captured until you select it and submit/);
 assert.match(html,/formData\.append\('userInitiated','true'\)/);
 assert.match(html,/api\('\/vision\/analyze'/);
 assert.match(html,/4\*1024\*1024/);
 assert.match(html,/visionImage\.value=''/);
 assert.match(css,/\.fortisni-vision-form/);
});
