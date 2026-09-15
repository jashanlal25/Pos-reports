const SHELL='pos-business-shell-v12';const ASSETS=['/','/index.html','/app.mjs?v=13','/parser.mjs','/worker.mjs','/storage.mjs','/style.css?v=13','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(ASSETS);await self.skipWaiting()})())});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pos-business-shell-')&&key!==SHELL)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 if(event.request.method==='POST'&&url.pathname==='/share-target'){
  event.respondWith(Promise.resolve(Response.redirect(new URL('/?shared=1',self.location.origin).href,303)));
  event.waitUntil((async()=>{try{
   const data=await event.request.formData();const file=data.get('backup');
   if(!file||typeof file.arrayBuffer!=='function'||!file.name.toLowerCase().endsWith('.zip')||file.size>150*1024*1024){await caches.open('pos-business-incoming').then(c=>c.put('/incoming-error',new Response('Invalid shared ZIP')));return}
   const cache=await caches.open('pos-business-incoming');
   await cache.put('/incoming-backup',new Response(file,{headers:{'Content-Type':'application/zip','X-Filename':encodeURIComponent(file.name)}}));
  }catch{await caches.open('pos-business-incoming').then(c=>c.put('/incoming-error',new Response('Shared file could not be received')))}})());return}
 if(event.request.method!=='GET')return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(async()=>{const cached=await caches.match('/');return cached||Response.error()}));return}
 if(ASSETS.includes(url.pathname+url.search))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
