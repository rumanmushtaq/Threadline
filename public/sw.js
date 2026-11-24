// Team app service worker. Pages are never cached (they hold private, live data);
// it only shows a friendly screen when a page cannot load because the phone is offline.
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Threadline</title>
<style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f8f4ee;color:#231d18;font:16px system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:22px;margin:16px 0 8px}p{color:#6b625a;margin:0 0 20px}button{background:#231d18;color:#f8f4ee;border:0;border-radius:10px;padding:12px 20px;font-size:15px}</style></head>
<body><div><img src="/team/icon-192.png" width="72" height="72" alt=""><h1>No internet connection</h1><p>Threadline needs the internet to show live stock and sales.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("threadline-offline-v1").then((c) => c.add("/team/icon-192.png")));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method === "GET" && req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
  } else if (req.method === "GET" && new URL(req.url).pathname === "/team/icon-192.png") {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
  }
});
