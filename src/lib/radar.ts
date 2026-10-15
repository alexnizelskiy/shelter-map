import { ensureSchema, sql } from "./db";
import { getSetting, setSetting } from "./chat-db";
import { parseChannelHtml, toRadarPost, type RadarPost } from "./radar-parse";
import { notifyRadar } from "./push";

// «Радар»: свежие сообщения из открытого канала @radarrussiia (публичная страница t.me/s/…). Храним только последние сутки.
// Обновление ленивое: при запросе, не чаще раза в минуту. Источник всегда указывается на странице, подпись канала не копируется.
export const RADAR_CHANNEL = "radarrussiia";
export const RADAR_URL = `https://t.me/${RADAR_CHANNEL}`;
const FRESH_MS = 60_000;
const KEEP_HOURS = 24;
const MAX_PAGES = 13; // 13 × 20 постов покрывают сутки с запасом (около 8 постов в час)
const PAGE_SIZE = 20;

export const radarEnabled = async () => { await ensureSchema(); return (await getSetting("radar_enabled", "1")) === "1"; };

async function fetchPage(before?: number): Promise<string> {
  const r = await fetch(`https://t.me/s/${RADAR_CHANNEL}${before ? `?before=${before}` : ""}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; OporaMap/1.0)", "Accept-Language": "ru" },
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}`);
  return r.text();
}

// Забираем новые посты: с последней страницы назад, пока не дойдём до уже известных или до постов старше суток
export async function refreshRadar(force = false): Promise<void> {
  await ensureSchema();
  if (!(await radarEnabled())) return;
  const now = Date.now();
  const lastRaw = await getSetting("radar_checked_at", "0");
  if (!force && now - Number(lastRaw) < FRESH_MS) return;
  // сравнение-и-замена: обновляет только один из параллельных запросов
  const claimed = await sql()`UPDATE chat_settings SET value = ${String(now)} WHERE key = 'radar_checked_at' AND value = ${lastRaw} RETURNING key`;
  if (!claimed.length) {
    if (lastRaw !== "0") return;
    await sql()`INSERT INTO chat_settings (key, value) VALUES ('radar_checked_at', ${String(now)}) ON CONFLICT DO NOTHING`;
  }
  try {
    const [{ maxid }] = await sql()<{ maxid: string | null }[]>`SELECT max(id)::text AS maxid FROM radar_posts`;
    const known = Number(maxid ?? 0);
    const since = now - KEEP_HOURS * 3600_000;
    // Первая страница даёт самые свежие посты. Старшие страницы берём параллельно: номера постов идут подряд, страница «до N» отдаёт
    // 20 постов младше N, поэтому шаг в 20 номеров не оставляет пропусков.
    const first = parseChannelHtml(await fetchPage());
    if (!first.length) throw new Error("Страница канала пустая");
    const top = first.reduce((a, r) => (r.id > a.id ? r : a)).id;
    const low = first.reduce((a, r) => (r.id < a.id ? r : a)).id;
    const pagesNeeded = known ? Math.min(MAX_PAGES, Math.ceil((top - known) / PAGE_SIZE) - 1) : MAX_PAGES;
    const cursors: number[] = [];
    for (let j = 0; j < pagesNeeded; j++) { const c = low - PAGE_SIZE * j; if (c > Math.max(known, 1)) cursors.push(c); }
    const pages = [first];
    for (let i = 0; i < cursors.length; i += 4) { // не больше 4 запросов одновременно
      pages.push(...(await Promise.all(cursors.slice(i, i + 4).map(async (c) => parseChannelHtml(await fetchPage(c))))));
    }
    const seen = new Set<number>();
    const fresh: RadarPost[] = [];
    for (const raw of pages.flat()) {
      if (seen.has(raw.id) || raw.id <= known || Date.parse(raw.at) < since) continue;
      seen.add(raw.id);
      const p = toRadarPost(raw);
      if (p) fresh.push(p);
    }
    for (const p of fresh) {
      await sql()`INSERT INTO radar_posts (id, posted_at, text, region) VALUES (${p.id}, ${p.at}, ${p.text}, ${p.region}) ON CONFLICT (id) DO NOTHING`;
    }
    await sql()`DELETE FROM radar_posts WHERE posted_at < now() - make_interval(hours => ${KEEP_HOURS})`;
    // push-уведомления только о свежих сообщениях (не старше 30 минут) и не при первом заполнении ленты
    if (known > 0) {
      const recent = fresh.filter((p) => now - Date.parse(p.at) < 30 * 60_000);
      if (recent.length) await notifyRadar(recent).catch((e) => console.error("radar push", e));
    }
    await setSetting("radar_error", "");
    await setSetting("radar_ok_at", String(now));
  } catch (e) {
    console.error("radar", e);
    await setSetting("radar_error", (e instanceof Error ? e.message : String(e)).slice(0, 200));
  }
}

export type RadarItem = { id: number; at: string; text: string; region: string };

// Посты за последние сутки (не скрытые модератором), новые сверху. region = «Ростовская область» и т. п.; пусто — вся Россия.
export async function listRadar(region: string, limit = 300): Promise<RadarItem[]> {
  await ensureSchema();
  const rows = region
    ? await sql()<{ id: string; at: string; text: string; region: string }[]>`
        SELECT id::text, to_char(posted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, text, region FROM radar_posts
        WHERE NOT hidden AND posted_at > now() - make_interval(hours => ${KEEP_HOURS}) AND (region = ${region} OR text ILIKE ${`%${region}%`})
        ORDER BY posted_at DESC, id DESC LIMIT ${limit}`
    : await sql()<{ id: string; at: string; text: string; region: string }[]>`
        SELECT id::text, to_char(posted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, text, region FROM radar_posts
        WHERE NOT hidden AND posted_at > now() - make_interval(hours => ${KEEP_HOURS})
        ORDER BY posted_at DESC, id DESC LIMIT ${limit}`;
  return rows.map((r) => ({ id: Number(r.id), at: r.at, text: r.text, region: r.region }));
}

export async function radarStatus() {
  await ensureSchema();
  const [c] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM radar_posts WHERE NOT hidden`;
  return { enabled: await radarEnabled(), count: c.n, okAt: Number(await getSetting("radar_ok_at", "0")), error: await getSetting("radar_error", "") };
}
