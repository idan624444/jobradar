// Offline + instant start: the app shell comes from cache right away and refreshes in the background;
// the job list always tries the network first so it is never stale when online.
const CACHE = "jobradar-v5";
const SHELL = ["./", "index.html", "app.js?v=6", "manifest.webmanifest", "icon.svg", "icon-180.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const fromNet = () => fetch(e.request).then(r => { if (r.ok && r.type === "basic") { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; });
  if (url.pathname.endsWith("/jobs.json")) {
    e.respondWith(fromNet().catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => { const net = fromNet().catch(() => hit); return hit || net; }));
});
