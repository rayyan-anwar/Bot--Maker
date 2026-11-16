const fs=require('fs');
const path=require('path');
const vm=require('vm');
const roots=['server','public/js','tests'];
let checked=0;
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())walk(full);
  else if(entry.isFile()&&entry.name.endsWith('.js'))check(full,fs.readFileSync(full,'utf8'));
 }
}
function check(file,source){new vm.Script(source,{filename:file});checked++;}
for(const root of roots)if(fs.existsSync(root))walk(root);
for(const file of ['public/index.html','public/dashboard.html','public/bot.html']){
 const html=fs.readFileSync(file,'utf8');
 const scripts=[...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)];
 for(const match of scripts)if(match[1].trim())check(file+' inline script',match[1]);
}
console.log('Syntax checks passed for '+checked+' JavaScript sources.');
