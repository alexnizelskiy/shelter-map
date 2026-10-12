import { cookies, headers } from "next/headers";
import { sourceForNewChatUser } from "./analytics";
import { ensureSchema, sql } from "./db";
import { dailyMaintenance } from "./maintenance";
import { LEGAL_VERSION } from "./operator";
import { SESSION_COOKIE, cleanFirstName, lastInitial, makeSessionToken, readSessionToken, type Identity } from "./chat-auth";

export type ChatUser = { id: number; firstName: string; lastInitial: string; avatar: string | null; role: string; bannedUntil: Date | null };

type Row = { id: string; first_name: string; last_initial: string; avatar_url: string | null; role: string; banned_until: Date | null };
const toUser = (r: Row): ChatUser => ({ id: Number(r.id), firstName: r.first_name, lastInitial: r.last_initial, avatar: r.avatar_url, role: r.role, bannedUntil: r.banned_until });

// Пользователь по куке сессии (или null). Бан проверяется отдельно при записи.
export async function currentUser(): Promise<ChatUser | null> {
  const id = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  await ensureSchema();
  const [r] = await sql()<Row[]>`SELECT id::text, first_name, last_initial, avatar_url, role, banned_until FROM chat_users WHERE id = ${id}`;
  return r ? toUser(r) : null;
}

export const isBanned = (u: ChatUser) => Boolean(u.bannedUntil && u.bannedUntil.getTime() > Date.now());

// Вход: создаём или обновляем пользователя. Фамилию не сохраняем, только первую букву.
export const CONSENT_COOKIE = "chat_consent";
// Согласие на обработку данных ставится в браузере до входа (галочка в чате); без него вход не выполняется
export async function hasConsent(): Promise<boolean> {
  return Boolean((await cookies()).get(CONSENT_COOKIE)?.value);
}

export async function loginIdentity(i: Identity): Promise<{ id: number; cookie: { value: string; maxAge: number } }> {
  await ensureSchema();
  const first = cleanFirstName(i.firstName);
  const initial = lastInitial(i.lastName);
  const avatar = i.avatar && /^https:\/\//i.test(i.avatar) ? i.avatar.slice(0, 500) : null;
  const [r] = await sql()<{ id: string; isNew: boolean }[]>`
    INSERT INTO chat_users (provider, ext_id, first_name, last_initial, avatar_url, consent_at, consent_version)
    VALUES (${i.provider}, ${i.extId}, ${first}, ${initial}, ${avatar}, now(), ${LEGAL_VERSION})
    ON CONFLICT (provider, ext_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_initial = EXCLUDED.last_initial, avatar_url = EXCLUDED.avatar_url, last_seen = now(), consent_at = now(), consent_version = ${LEGAL_VERSION}
    RETURNING id::text, (xmax = 0) AS "isNew"`;
  const id = Number(r.id);
  if (r.isNew) {
    // откуда пришёл новый профиль: метка ссылки бота или метка сегодняшнего визита; сбой учёта вход не ломает
    try {
      const source = await sourceForNewChatUser(await headers(), i.provider, i.extId);
      if (source) await sql()`UPDATE chat_users SET source = ${source} WHERE id = ${id} AND source = ''`;
    } catch (e) { console.error("chat source", e); }
  }
  return { id, cookie: makeSessionToken(id) };
}

export const setSessionCookie = async (c: { value: string; maxAge: number }) =>
  (await cookies()).set(SESSION_COOKIE, c.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: c.maxAge });

// ───── настройки чата и автоочистка ─────
export async function getSetting(key: string, fallback: string): Promise<string> {
  const [r] = await sql()<{ value: string }[]>`SELECT value FROM chat_settings WHERE key = ${key}`;
  return r?.value ?? fallback;
}
export const setSetting = (key: string, value: string) =>
  sql()`INSERT INTO chat_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;

export const DEFAULT_CLEAR_HOURS = 48;

export type ChatMeta = { enabled: boolean; clearHours: number; nextClearAt: number | null };

// Очищает чат по расписанию: раз в N часов удаляются все сообщения. Выполняется лениво при обращении к чату.
export async function maintainChat(): Promise<ChatMeta> {
  await dailyMaintenance().catch((e) => console.error("maintenance", e));
  const clearHours = Number(await getSetting("clear_hours", String(DEFAULT_CLEAR_HOURS)));
  const enabled = (await getSetting("enabled", "1")) === "1";
  const lastRaw = await getSetting("last_clear_at", "");
  const now = Date.now();
  if (!lastRaw) { await setSetting("last_clear_at", String(now)); return { enabled, clearHours, nextClearAt: clearHours > 0 ? now + clearHours * 3600_000 : null }; }
  let last = Number(lastRaw);
  if (clearHours > 0) {
    const iv = clearHours * 3600_000;
    if (now >= last + iv) {
      const aligned = last + Math.floor((now - last) / iv) * iv; // сохраняем сетку расписания
      // сравнение-и-замена: очистку выполнит только один из параллельных запросов
      const upd = await sql()`UPDATE chat_settings SET value = ${String(aligned)} WHERE key = 'last_clear_at' AND value = ${lastRaw} RETURNING key`;
      if (upd.length) await sql()`DELETE FROM chat_messages`;
      last = aligned;
    }
  }
  return { enabled, clearHours, nextClearAt: clearHours > 0 ? last + clearHours * 3600_000 : null };
}

export const CLEAR_OPTIONS: { hours: number; label: string }[] = [
  { hours: 24, label: "Раз в день" },
  { hours: 48, label: "Раз в 2 дня (по умолчанию)" },
  { hours: 72, label: "Раз в 3 дня" },
  { hours: 168, label: "Раз в неделю" },
  { hours: 336, label: "Раз в 2 недели" },
  { hours: 720, label: "Раз в месяц" },
  { hours: 0, label: "Не очищать" },
];
