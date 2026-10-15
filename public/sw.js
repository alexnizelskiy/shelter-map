/* Service worker сервиса «Опора — карта укрытий».
 * Что кэшируется: оболочка приложения (_next/static), открытые страницы (отдаются сразу и обновляются в фоне), список укрытий города (/api/shelters).
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
      } catch { /* нет сети при установке: докэшируем при обычной работе */ }
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
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
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
  if (p === "/api/shelters" || p === "/api/map-points") {
    event.respondWith(networkFirst(req, DATA, 5000));
    return;
  }

  // остальные API (поиск, маршруты, отметки) — только сеть
  if (p.startsWith("/api/")) return;

  // страницы: сначала отдаём сохранённую копию (интерфейс открывается сразу, без загрузки) и обновляем её в фоне;
  // если копии ещё нет — сеть (до 4 секунд), без сети — страница «Нет сети». Новые данные страница подтягивает сама (см. CityView).
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(PAGES);
      const key = new Request(url.origin + p); // ключ без query: ?go=…, ?chat=1 и т. п. не плодят копии
      const hit = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => { if (res && res.ok && !res.redirected) cache.put(key, res.clone()); return res; });
      if (hit) {
        event.waitUntil(fresh.catch(() => {}));
        // пометка для страницы: она открыта из копии и после загрузки обновит данные
        const headers = new Headers(hit.headers);
        headers.set("Server-Timing", "sw-cache");
        return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
      }
      try {
        return await Promise.race([fresh, timeout(4000)]);
      } catch {
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

// Push-уведомления «Радара»: новое сообщение или сводка «N новых». Одно уведомление заменяет предыдущее (tag).
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  event.waitUntil(self.registration.showNotification(d.title || "Радар", {
    body: d.body || "", icon: "/pwa-icon/192", badge: "/pwa-icon/48", tag: d.tag || "radar", renotify: Boolean(d.renotify), lang: "ru",
    data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/" },
  }));
});

// Нажатие: открываем раздел «Радар» в уже открытом окне сайта или в новом
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      await c.focus();
      try { if ("navigate" in c) await c.navigate(url); } catch { /* окно нельзя перенаправить: оставляем как есть */ }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
