import { createHash, timingSafeEqual } from "node:crypto";

// Сайт может стоять за собственным nginx-прокси. Vercel тогда видит IP прокси, а не посетителя, поэтому прокси передаёт
// настоящий IP (и при желании геоданные) в заголовках X-Opora-*, подписанных общим секретом PROXY_SECRET.
// Без верного секрета эти заголовки игнорируются, подделать их снаружи нельзя.
const SECRET = () => (process.env.PROXY_SECRET ?? "").trim().replace(/^["']+|["']+$/g, "");

const eq = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export function viaTrustedProxy(h: Headers): boolean {
  const s = SECRET();
  const got = h.get("x-opora-proxy-secret");
  return Boolean(s && got && eq(got, s));
}

export function clientIpFromHeaders(h: Headers): string {
  if (viaTrustedProxy(h)) {
    const ip = (h.get("x-opora-client-ip") ?? "").trim();
    if (ip) return ip;
  }
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export type ClientGeo = { lat: number; lng: number; country: string | null };

// Геоданные посетителя: за доверенным прокси — из его заголовков (если там настроен GeoIP), иначе — заголовки Vercel
export function clientGeoFromHeaders(h: Headers): ClientGeo | null {
  const trusted = viaTrustedProxy(h);
  const lat = Number(trusted ? h.get("x-opora-geo-lat") : h.get("x-vercel-ip-latitude"));
  const lng = Number(trusted ? h.get("x-opora-geo-lng") : h.get("x-vercel-ip-longitude"));
  const country = (trusted ? h.get("x-opora-geo-country") : h.get("x-vercel-ip-country")) || null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng, country };
}
