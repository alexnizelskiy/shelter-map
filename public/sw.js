/* Service worker сервиса «Опора — карта укрытий».
 * Что кэшируется: оболочка приложения (_next/static), открытые страницы, список укрытий города (/api/shelters).
 * Чего НЕ кэшируется: тайлы карт сторонних сервисов (запрещено их условиями), админка, чат, маршруты, поиск мест.
 */
const V = new URL(self.location).searchParams.get("v") || "dev";
const STATIC = `static-${V}`;
const PAGES = `pages-${V}`;
const DATA = `data-${V}`;
const PRECACHE_PAGES = ["/alarm", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES);
    const statics = await caches.open(STATIC);
    for (const url of PRECACHE_PAGES) {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (!res.ok) continue;
        await pages.put(url, res.clone());
        // чтобы страница открывалась без сети с первого раза, заранее забираем её скрипты и стили
        const html = await res.text();
        const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
        await Promise.all(assets.map((a) => statics.add(a).catch(() => {})));
      } catch (_) { /* нет сети при установке: докэшируем при обычной работе */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC, PAGES, DATA]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));

async function networkFirst(req, cacheName, ms) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(req), timeout(ms)]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw _;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // чужие домены (тайлы, аватары, скрипты мессенджеров) не трогаем

  const p = url.pathname;
  if (p.startsWith("/admin") || p.startsWith("/api/auth") || p.startsWith("/api/chat") || p.startsWith("/api/photos/")) return;

  // скрипты и стили приложения: имя файла содержит хэш, поэтому cache-first безопасен
  if (p.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // список укрытий для офлайна
  if (p === "/api/shelters") {
    event.respondWith(networkFirst(req, DATA, 5000));
    return;
  }

  // остальные API (поиск, маршруты, отметки) — только сеть
  if (p.startsWith("/api/")) return;

  // страницы: сначала сеть (до 4 секунд), без неё — сохранённая копия, затем страница «Нет сети»
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await networkFirst(req, PAGES, 4000);
      } catch (_) {
        const cache = await caches.open(PAGES);
        return (await cache.match("/offline")) || new Response("Нет сети", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // прочие файлы сайта (иконки, воркер карты): отдаём копию и обновляем в фоне
  if (/\.(?:png|svg|ico|mjs|js|css|woff2?)$/.test(p) || p === "/manifest.webmanifest") {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || fresh;
    })());
  }
});

self.addEventListener("message", (event) => { if (event.data === "skipWaiting") self.skipWaiting(); });
