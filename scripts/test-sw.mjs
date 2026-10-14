// Проверка логики public/sw.js в изолированном окружении: node scripts/test-sw.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

// ── подмена кэша и сети ──
const store = new Map(); // имя кэша -> Map(url -> Response)
const mkCache = (name) => {
  if (!store.has(name)) store.set(name, new Map());
  const m = store.get(name);
  const key = (r) => (typeof r === "string" ? new URL(r, "http://localhost:3000") : new URL(r.url)).toString();
  return {
    async put(req, res) { m.set(key(req), res.clone()); },
    async add(req) { const r = await fetchImpl(req); if (!r.ok) throw new Error("bad"); m.set(key(req), r.clone()); },
    async match(req, opts = {}) {
      const k = key(req);
      if (m.has(k)) return m.get(k).clone();
      if (opts.ignoreSearch) { const u = new URL(k); for (const [kk, v] of m) { const x = new URL(kk); if (x.pathname === u.pathname) return v.clone(); } }
      return undefined;
    },
    async keys() { return [...m.keys()].map((u) => ({ url: u })); },
  };
};
const cachesImpl = {
  async open(n) { return mkCache(n); },
  async keys() { return [...store.keys()]; },
  async delete(n) { return store.delete(n); },
};

let online = true;
const hits = [];
const ROUTES = {
  "/alarm": () => new Response('<html><script src="/_next/static/chunks/alarm.js"></script><link href="/_next/static/css/a.css"></html>', { status: 200 }),
  "/offline": () => new Response("<html>offline</html>", { status: 200 }),
  "/rostov-na-donu": () => new Response("<html>city</html>", { status: 200 }),
  "/api/shelters": () => Response.json({ shelters: [1, 2, 3] }),
  "/_next/static/chunks/alarm.js": () => new Response("js", { status: 200 }),
  "/_next/static/css/a.css": () => new Response("css", { status: 200 }),
  "/_next/static/chunks/other.js": () => new Response("other", { status: 200 }),
};
async function fetchImpl(input) {
  const url = new URL(typeof input === "string" ? input : input.url, "http://localhost:3000");
  hits.push(url.pathname);
  if (!online) throw new TypeError("offline");
  const h = ROUTES[url.pathname];
  return h ? h() : new Response("nf", { status: 404 });
}

// ── окружение воркера ──
const handlers = {};
const self = {
  location: new URL("http://localhost:3000/sw.js?v=t1"),
  addEventListener: (type, fn) => { handlers[type] = fn; },
  skipWaiting: async () => {},
  clients: { claim: async () => {} },
};
vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches: cachesImpl, fetch: fetchImpl, URL, Request, Response, Headers, Promise, setTimeout, clearTimeout, Set, Error, TypeError }, { filename: "sw.js" });

const lifecycle = async (type) => { let p; handlers[type]({ waitUntil: (x) => { p = x; } }); await p; };
const doFetch = async (path, { mode = "cors", method = "GET", origin = "http://localhost:3000" } = {}) => {
  const request = Object.assign(new Request(origin + path, { method }), {});
  Object.defineProperty(request, "mode", { value: mode });
  let responded = null;
  const waits = [];
  handlers.fetch({ request, respondWith: (p) => { responded = p; }, waitUntil: (p) => { waits.push(p); } });
  if (!responded) return { intercepted: false };
  try { const res = await responded; const body = await res.text(); await Promise.allSettled(waits); return { intercepted: true, status: res.status, body, marker: res.headers.get("server-timing") }; } catch (e) { return { intercepted: true, error: String(e) }; }
};

// 1) установка
await lifecycle("install");
const pages = store.get("pages-t1"), statics = store.get("static-t1");
t("install: страницы /alarm и /offline в кэше", pages?.has("http://localhost:3000/alarm") && pages?.has("http://localhost:3000/offline"));
t("install: скрипты и стили /alarm заранее сохранены", statics?.has("http://localhost:3000/_next/static/chunks/alarm.js") && statics?.has("http://localhost:3000/_next/static/css/a.css"));

// 2) активация чистит старые версии
store.set("pages-OLD", new Map()); store.set("static-OLD", new Map());
await lifecycle("activate");
t("activate: старые кэши удалены, новые остались", !store.has("pages-OLD") && !store.has("static-OLD") && store.has("pages-t1"));

// 3) онлайн: страница сохраняется
let r = await doFetch("/rostov-na-donu", { mode: "navigate" });
t("онлайн, первый раз: страница из сети, без пометки о копии", r.status === 200 && r.body.includes("city") && r.marker !== "sw-cache");
t("онлайн: страница города попала в кэш", pages.has("http://localhost:3000/rostov-na-donu"));

// страница открывается сразу из копии, а свежая версия подтягивается в фоне
const hitsBefore = hits.length;
ROUTES["/rostov-na-donu"] = () => new Response("<html>city v2</html>", { status: 200 });
r = await doFetch("/rostov-na-donu", { mode: "navigate" });
t("повторно: отдаётся сохранённая копия сразу (старая версия)", r.status === 200 && r.body === "<html>city</html>");
t("…с пометкой Server-Timing: sw-cache (страница обновит данные сама)", r.marker === "sw-cache");
t("…и в фоне запрошена свежая версия", hits.length > hitsBefore && hits.at(-1) === "/rostov-na-donu");
r = await doFetch("/rostov-na-donu?chat=1", { mode: "navigate" });
t("следующий заход (даже с ?query): уже новая версия", r.body === "<html>city v2</html>");
t("копии с разными ?query не плодятся", [...pages.keys()].filter((k) => k.includes("rostov-na-donu")).length === 1);

// 4) офлайн
online = false;
r = await doFetch("/rostov-na-donu?go=rnd-0003", { mode: "navigate" });
t("офлайн: страница города из кэша (даже с другим ?query)", r.status === 200 && r.body.includes("city v2"));
r = await doFetch("/alarm", { mode: "navigate" });
t("офлайн: /alarm открывается из кэша", r.status === 200 && r.body.includes("alarm.js"));
r = await doFetch("/some-new-page", { mode: "navigate" });
t("офлайн: незнакомая страница → «Нет сети»", r.status === 200 && r.body.includes("offline"));
r = await doFetch("/_next/static/chunks/alarm.js");
t("офлайн: скрипты приложения из кэша", r.status === 200 && r.body === "js");

// 5) список укрытий: онлайн → кэш → офлайн
online = true;
await doFetch("/api/shelters?city=rostov-na-donu");
online = false;
r = await doFetch("/api/shelters?city=rostov-na-donu");
t("список укрытий доступен офлайн после первого запроса", r.status === 200 && r.body.includes("shelters"));

// 6) то, что нельзя трогать
for (const p of ["/admin", "/admin?tab=chat", "/api/chat/messages?room=x", "/api/auth/dev", "/api/photos/1"]) {
  const x = await doFetch(p, { mode: p.startsWith("/admin") ? "navigate" : "cors" });
  t(`не перехватывается: ${p}`, x.intercepted === false);
}
for (const p of ["/api/route?from=1,2&to=3,4", "/api/places?q=ab", "/api/reports?city=x"]) {
  const x = await doFetch(p);
  t(`только сеть, без кэша: ${p}`, x.intercepted === false);
}
t("POST не перехватывается", (await doFetch("/api/reports", { method: "POST" })).intercepted === false);
const tile = await doFetch("/v1/tiles/?x=1&y=2&z=3", { origin: "https://tiles.api-maps.yandex.ru" });
t("тайлы чужих карт не перехватываются и не кэшируются", tile.intercepted === false);

if (bad) process.exitCode = 1;
