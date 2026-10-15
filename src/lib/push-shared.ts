// Общие чистые функции push-уведомлений «Радара»: проверка адреса доставки, выбор сообщений по региону, текст уведомления.
export type PushScope = "region" | "all";
export type PostLite = { id: number; at: string; text: string; region: string };

// Адреса доставки принимаем только у известных push-сервисов браузеров (иначе наш сервер мог бы слать запросы на произвольные адреса)
const HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com"];
const SUFFIXES = [".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com", ".yandex.net", ".yandex.ru"];
export function allowedEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 600) return false;
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const h = u.hostname.toLowerCase();
  return HOSTS.includes(h) || SUFFIXES.some((s) => h.endsWith(s));
}

// Путь, который откроется по нажатию на уведомление: только внутри нашего сайта
export const safePath = (v: unknown) => (typeof v === "string" && /^\/[A-Za-z0-9_\-/?=&%.]{0,100}$/.test(v) && !v.startsWith("//") ? v : "/");

export const matchesRegion = (p: PostLite, region: string) => !region || p.region === region || p.text.toLowerCase().includes(region.toLowerCase());

const oneLine = (t: string, max: number) => { const s = t.replace(/\s*\n\s*/g, " · ").trim(); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };

// Одно уведомление на подписчика за обновление: одно сообщение показываем целиком, несколько сворачиваем в «N новых»
export function buildPayload(posts: PostLite[], scope: PushScope, url: string) {
  const sorted = [...posts].sort((a, b) => a.id - b.id);
  const last = sorted[sorted.length - 1];
  return sorted.length === 1
    ? { title: "Радар", body: oneLine(last.text, 180), tag: "radar", renotify: scope === "region", url }
    : { title: `Радар: ${sorted.length} ${plural(sorted.length)}`, body: sorted.slice(-2).map((p) => oneLine(p.text, 90)).join("\n"), tag: "radar", renotify: scope === "region", url };
}
const plural = (n: number) => { const m = n % 100, d = n % 10; return m >= 11 && m <= 14 ? "новых сообщений" : d === 1 ? "новое сообщение" : d >= 2 && d <= 4 ? "новых сообщения" : "новых сообщений"; };
