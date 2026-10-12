import { cleanEnv } from "./env";

// MAX Bot API (dev.max.ru): токен в заголовке Authorization. Основной адрес — platform-api2.max.ru, прежний platform-api.max.ru
// пробуем при сбое сети. Всё это написано по документации и проверяется кнопкой в админке (вкладка «Бот»).
export class MaxError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export const maxToken = () => cleanEnv(process.env.MAX_BOT_TOKEN, "MAX_BOT_TOKEN");
export const maxUsername = () => cleanEnv(process.env.NEXT_PUBLIC_MAX_BOT, "NEXT_PUBLIC_MAX_BOT").replace(/^@/, "").replace(/^https?:\/\/max\.ru\//i, "");
export const maxChannelId = () => cleanEnv(process.env.MAX_CHANNEL_ID, "MAX_CHANNEL_ID");
export const maxChannelLink = () => cleanEnv(process.env.MAX_CHANNEL_LINK, "MAX_CHANNEL_LINK");
export const maxWebhookSecret = () => cleanEnv(process.env.MAX_WEBHOOK_SECRET, "MAX_WEBHOOK_SECRET");
export const maxGateEnabled = () => Boolean(maxChannelId());
export const maxUrgentEnabled = () => cleanEnv(process.env.MAX_URGENT_BUTTON ?? process.env.TELEGRAM_URGENT_BUTTON) !== "0";

const BASES = () => {
  const own = cleanEnv(process.env.MAX_API_BASE).replace(/\/+$/, "");
  return own ? [own] : ["https://platform-api2.max.ru", "https://platform-api.max.ru"];
};

export async function maxApi<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  o: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const token = maxToken();
  if (!token) throw new MaxError("Не задан MAX_BOT_TOKEN");
  const qs = Object.entries(o.query ?? {}).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  let lastNet: unknown;
  for (const base of BASES()) {
    let r: Response;
    try {
      r = await fetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
        method,
        headers: { Authorization: token, ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: AbortSignal.timeout(7000),
      });
    } catch (e) { lastNet = e; continue; } // сеть недоступна: пробуем запасной адрес
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try { j = text ? JSON.parse(text) : {}; } catch { /* не JSON */ }
    if (!r.ok) throw new MaxError(String(j.message ?? j.error ?? j.code ?? `MAX ${r.status}`), r.status);
    return j as T;
  }
  throw new MaxError(`MAX недоступен: ${lastNet instanceof Error ? lastNet.message : String(lastNet)}`);
}

export type MaxButton =
  | { type: "link"; text: string; url: string }
  | { type: "callback"; text: string; payload: string };

const keyboard = (rows: MaxButton[][]) => (rows.length ? [{ type: "inline_keyboard", payload: { buttons: rows } }] : undefined);

// Личное сообщение пользователю (по его id). Не чаще двух сообщений в секунду одному получателю.
export async function maxSend(userId: string | number, text: string, rows: MaxButton[][] = []): Promise<void> {
  await maxApi("POST", "/messages", { query: { user_id: userId }, body: { text: text.slice(0, 4000), attachments: keyboard(rows) } });
}

// Всплывающий ответ на нажатие callback-кнопки
export async function maxAnswer(callbackId: string, notification: string): Promise<void> {
  await maxApi("POST", "/answers", { query: { callback_id: callbackId }, body: { notification } });
}

// Подписан ли человек на канал. Бот должен быть администратором канала; пустой ответ = не участник.
export async function maxIsSubscribed(userId: string | number): Promise<boolean> {
  if (!maxGateEnabled()) return true;
  const r = await maxApi<{ members?: { user_id?: number | string; id?: number | string }[] }>("GET", `/chats/${maxChannelId()}/members`, { query: { user_ids: String(userId) } });
  return (r.members ?? []).some((m) => String(m.user_id ?? m.id) === String(userId));
}
