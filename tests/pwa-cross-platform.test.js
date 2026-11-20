const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','public');

test('PWA manifest declares standalone BotForge app and valid icon asset',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 assert.equal(manifest.name,'BotForge');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.scope,'/');
 assert.ok(manifest.icons.some(icon=>fs.existsSync(path.join(root,icon.src.replace(/^\//,'')))));
});

test('all current app pages include manifest metadata and service worker registration',()=>{
 for(const page of ['index.html','dashboard.html','bot.html','admin.html','billing.html','reset-password.html']){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/,page);
  assert.match(html,/navigator\.serviceWorker\.register\('\/sw\.js'\)/,page);
  assert.match(html,/apple-mobile-web-app-capable/,page);
 }
});

test('service worker excludes APIs, health, metrics and user-specific navigation from cache',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.match(sw,/url\.pathname==='\/metrics'/);
 assert.match(sw,/request\.mode==='navigate'/);
 assert.match(sw,/fetch\(request\)\.catch\(\(\)=>caches\.match\('\/offline\.html'\)\)/);
 assert.doesNotMatch(sw,/cache\.put\(request,response\)/);
});

test('offline fallback clearly explains network requirement',()=>{
 const html=fs.readFileSync(path.join(root,'offline.html'),'utf8');
 assert.match(html,/You’re offline/);
 assert.match(html,/internet connection/);
});

test('cross-platform strategy covers all requested operating systems',()=>{
 const doc=fs.readFileSync(path.join(__dirname,'..','docs','CROSS_PLATFORM_APPLICATION_STRATEGY.md'),'utf8');
 for(const platform of ['Android','iOS','Windows','macOS','Linux'])assert.ok(doc.includes(platform),platform);
 assert.match(doc,/Capacitor/);
 assert.match(doc,/Tauri 2/);
});
