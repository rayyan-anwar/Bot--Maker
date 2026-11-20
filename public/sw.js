'use strict';
const CACHE='botforge-static-v1';
const PRECACHE=['/offline.html','/images/botforge-icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('botforge-static-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/api/')||url.pathname==='/metrics'||url.pathname==='/healthz'||url.pathname==='/readyz')return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));
  return;
 }
 if(!/\\.(?:css|js|svg|png|webp|woff2?)$/i.test(url.pathname)&&url.pathname!=='/manifest.webmanifest')return;
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
  if(!response||!response.ok||response.type!=='basic')return response;
  const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;
 })));
});
