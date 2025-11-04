// very small cache for team task page + docs
const CACHE = 'team-task-v1';
self.addEventListener('install', (e)=> {
  self.skipWaiting();
});
self.addEventListener('activate', (e)=> {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k=>k.startsWith('team-task-') && k!==CACHE).map(k=>caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', (e)=>{
  const req = e.request;
  // only GET, ignore POST
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      try {
        const net = await fetch(req);
        // cache only successful GETs
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error('offline and not cached');
      }
    })
  );
});
