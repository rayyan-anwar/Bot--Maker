const fs=require('fs');
const path=require('path');
const vm=require('vm');
const roots=['server','public/js','tests'];
let checked=0;
function check(file,source){new vm.Script(source,{filename:file});checked++;}
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())walk(full);
  else if(entry.isFile()&&entry.name.endsWith('.js'))check(full,fs.readFileSync(full,'utf8'));
 }
}
for(const root of roots)if(fs.existsSync(root))walk(root);
for(const file of ['public/index.html','public/dashboard.html','public/bot.html']){
 const html=fs.readFileSync(file,'utf8');let cursor=0;
 while(true){
  const open=html.indexOf('<script',cursor);if(open<0)break;
  const tagEnd=html.indexOf('>',open);if(tagEnd<0)break;
  const close=html.indexOf('</script>',tagEnd);if(close<0)break;
  const source=html.slice(tagEnd+1,close);
  if(source.trim())check(file+' inline script',source);
  cursor=close+9;
 }
}
console.log('Syntax checks passed for '+checked+' JavaScript sources.');
