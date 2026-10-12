import { ensureSchema, sql } from "./db";

// Учёт людей, открывших бота или мини-приложение (Telegram, MAX). Хранится только идентификатор: имя и фамилия не нужны.
export type Platform = "telegram" | "max";

// Метка ссылки (?start=метка / ?startapp=метка / ?src=метка): латиница, цифры, _ и -
export const cleanSource = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
};

// Кто и что сделал. «start» — человек запустил бота (после этого ему можно писать), «open» — открыл мини-приложение.
export type BotEventKind = "start" | "open" | "sub_ok" | "sub_no" | "stop" | "resume";

export type TrackInput = {
  platform: Platform;
  extId: string;
  chatId?: string | null;
  source?: string;
  kind: BotEventKind;
  lang?: string | null;
  started?: boolean; // человек написал боту сам (из чата): ему можно отвечать и слать сообщения
};

export type Tracked = { id: number; isNew: boolean };

const MSK_DAY = "(now() AT TIME ZONE 'Europe/Moscow')::date";

export async function trackBot(e: TrackInput): Promise<Tracked> {
  await ensureSchema();
  const source = cleanSource(e.source);
  const started = e.started ?? (e.kind === "start" || e.kind === "stop" || e.kind === "resume");
  const lang = e.lang ? e.lang.slice(0, 10) : null;
  const [u] = await sql()<{ id: string; isNew: boolean }[]>`
    INSERT INTO bot_users (platform, ext_id, chat_id, source, started, lang, opens)
    VALUES (${e.platform}, ${e.extId}, ${e.chatId ?? null}, ${source}, ${started}, ${lang}, 1)
    ON CONFLICT (platform, ext_id) DO UPDATE SET
      last_seen = now(),
      opens = bot_users.opens + 1,
      chat_id = COALESCE(EXCLUDED.chat_id, bot_users.chat_id),
      started = bot_users.started OR EXCLUDED.started,
      blocked = CASE WHEN EXCLUDED.started THEN false ELSE bot_users.blocked END,
      lang = COALESCE(EXCLUDED.lang, bot_users.lang)
    RETURNING id::text, (xmax = 0) AS "isNew"`;
  const id = Number(u.id);
  await sql().unsafe(`INSERT INTO bot_activity (user_id, day) VALUES ($1, ${MSK_DAY}) ON CONFLICT DO NOTHING`, [id]);
  await sql()`INSERT INTO bot_events (user_id, kind, source) VALUES (${id}, ${e.kind}, ${source})`;
  if (e.kind === "sub_ok" || e.kind === "sub_no") await sql()`UPDATE bot_users SET subscribed = ${e.kind === "sub_ok"} WHERE id = ${id}`;
  if (e.kind === "stop") await sql()`UPDATE bot_users SET notify = false WHERE id = ${id}`;
  if (e.kind === "resume") await sql()`UPDATE bot_users SET notify = true WHERE id = ${id}`;
  return { id, isNew: u.isNew };
}

// Человек заблокировал бота или удалил диалог: рассылки ему больше не шлём, пока он снова не запустит бота
export async function markBlocked(platform: Platform, extId: string): Promise<void> {
  await ensureSchema();
  await sql()`UPDATE bot_users SET blocked = true WHERE platform = ${platform} AND ext_id = ${extId}`;
}

export async function markBlockedById(id: number): Promise<void> {
  await sql()`UPDATE bot_users SET blocked = true WHERE id = ${id}`;
}

// Безопасная обёртка для мест, где сбой учёта не должен ломать ответ человеку
export async function trackSafe(e: TrackInput): Promise<Tracked | null> {
  try { return await trackBot(e); }
  catch (err) { console.error("track", err); return null; }
}
