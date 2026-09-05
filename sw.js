const CACHE_NAME='dci-pwa-2.7.0';
const APP_SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('dci-pwa-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('dci-share-db',1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('pending')) db.createObjectStore('pending',{keyPath:'id',autoIncrement:true});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function saveSharedPhotos(files){
  if(!files.length) return 0;
  const db=await openDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('pending','readwrite');
    const store=tx.objectStore('pending');
    const batch=Date.now();
    files.forEach((f,i)=>store.add({
      batch,
      order:i,
      name:f.name||`Gallery_${batch}_${i+1}.jpg`,
      type:f.type||'image/jpeg',
      lastModified:f.lastModified||batch,
      blob:f
    }));
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
  db.close();
  return files.length;
}

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  const isShare=event.request.method==='POST' && /\/share-target\/?$/.test(url.pathname);
  if(isShare){
    event.respondWith((async()=>{
      try{
        const form=await event.request.formData();
        let files=form.getAll('photos').filter(v=>v instanceof File && ((v.type||'').startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(v.name||'')));
        if(!files.length){
          files=[];
          for(const [,v] of form.entries()) if(v instanceof File && ((v.type||'').startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(v.name||''))) files.push(v);
        }
        await saveSharedPhotos(files);
        const dest=new URL('./index.html?shared=1&t='+Date.now(),self.registration.scope).href;
        return Response.redirect(dest,303);
      }catch(err){
        const dest=new URL('./index.html?share_error=1',self.registration.scope).href;
        return Response.redirect(dest,303);
      }
    })());
    return;
  }

  if(event.request.method!=='GET') return;
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached) return cached;
    try{
      const res=await fetch(event.request);
      if(res && res.ok && new URL(event.request.url).origin===self.location.origin){
        const cache=await caches.open(CACHE_NAME); cache.put(event.request,res.clone());
      }
      return res;
    }catch(_){
      if(event.request.mode==='navigate') return (await caches.match('./index.html')) || new Response('Offline',{status:503});
      return new Response('',{status:503});
    }
  })());
});
