import { createHash } from "node:crypto";
import { cleanEnv } from "./env";
import { clientIpFromHeaders } from "./proxy-trust";
import { cleanSource } from "./bot-users";
import { ensureSchema, sql } from "./db";

// Посещаемость без cookie. Идентификатор посетителя — хэш IP и браузера с солью, которая меняется каждые сутки:
// по нему нельзя узнать человека и сопоставить его визиты между днями.
const MSK = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export function visitorHash(h: Headers, day = MSK()): string {
  const salt = cleanEnv(process.env.IP_HASH_SECRET, "IP_HASH_SECRET") || "dev-only-salt";
  const ip = clientIpFromHeaders(h);
  const ua = (h.get("user-agent") ?? "").slice(0, 300);
  return createHash("sha256").update(`visit|${salt}|${day}|${ip}|${ua}`).digest("hex").slice(0, 24);
}

export const isBotUa = (ua: string | null) => !ua || /bot|crawl|spider|slurp|preview|monitor|curl|wget|python-requests|headless/i.test(ua);

export const CHANNELS = ["web", "pwa", "tg", "max"] as const;
export type Channel = (typeof CHANNELS)[number];

// Не города: служебные страницы сайта
const RESERVED = new Set(["alarm", "tg", "max", "privacy", "terms", "rules", "data-request", "offline", "admin", "api"]);

export const cityFromPath = (path: string): string => {
  const seg = path.split("?")[0].split("/").filter(Boolean)[0] ?? "";
  return /^[a-z0-9-]{2,60}$/.test(seg) && !RESERVED.has(seg) ? seg : "";
};

// Источник перехода: метка из ссылки или домен, с которого пришли (без путей и параметров)
export const cleanRef = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[a-z0-9.-]{3,60}$/.test(s) ? `ref:${s}` : "";
};

export async function recordHit(h: Headers, o: { path: string; source?: string; ref?: string; channel?: string }): Promise<void> {
  await ensureSchema();
  const channel = (CHANNELS as readonly string[]).includes(o.channel ?? "") ? (o.channel as Channel) : "web";
  const source = cleanSource(o.source) || cleanRef(o.ref);
  const city = cityFromPath(o.path);
  const v = visitorHash(h);
  await sql().unsafe(
    `INSERT INTO site_hits (day, visitor, source, channel, city) VALUES ((now() AT TIME ZONE 'Europe/Moscow')::date, $1, $2, $3, $4)
     ON CONFLICT (day, visitor) DO UPDATE SET
       hits = site_hits.hits + 1, last_at = now(),
       city = CASE WHEN EXCLUDED.city <> '' THEN EXCLUDED.city ELSE site_hits.city END,
       source = CASE WHEN site_hits.source = '' THEN EXCLUDED.source ELSE site_hits.source END,
       channel = CASE WHEN site_hits.channel = 'web' THEN EXCLUDED.channel ELSE site_hits.channel END`,
    [v, source, channel, city],
  );
}

// Источник нового профиля чата: для Telegram и MAX — метка первого входа в бота, для остальных — метка визита за сегодня
export async function sourceForNewChatUser(h: Headers, provider: string, extId: string): Promise<string> {
  await ensureSchema();
  if (provider === "telegram" || provider === "max") {
    const [r] = await sql()<{ source: string }[]>`SELECT source FROM bot_users WHERE platform = ${provider} AND ext_id = ${extId}`;
    if (r?.source) return r.source;
  }
  const [r] = await sql().unsafe(
    `SELECT source FROM site_hits WHERE day = (now() AT TIME ZONE 'Europe/Moscow')::date AND visitor = $1`,
    [visitorHash(h)],
  ) as { source: string }[];
  return r?.source ?? "";
}
