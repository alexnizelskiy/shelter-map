import { cleanEnv } from "./env";

// Telegram Bot API: вызовы с токеном из TELEGRAM_BOT_TOKEN
export class TgError extends Error {
  constructor(message: string, public code?: number) { super(message); }
}

export const botToken = () => cleanEnv(process.env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
export const botUsername = () => cleanEnv(process.env.NEXT_PUBLIC_TELEGRAM_BOT, "NEXT_PUBLIC_TELEGRAM_BOT").replace(/^@/, "");
export const channelId = () => cleanEnv(process.env.TELEGRAM_CHANNEL, "TELEGRAM_CHANNEL");
export const webhookSecret = () => cleanEnv(process.env.TELEGRAM_WEBHOOK_SECRET, "TELEGRAM_WEBHOOK_SECRET");
export const urgentEnabled = () => cleanEnv(process.env.TELEGRAM_URGENT_BUTTON) !== "0";

// Ссылка для подписки: явная TELEGRAM_CHANNEL_LINK или https://t.me/<имя>, если канал задан как @имя
export function channelLink(): string {
  const l = cleanEnv(process.env.TELEGRAM_CHANNEL_LINK, "TELEGRAM_CHANNEL_LINK");
  if (l) return l;
  const c = channelId();
  return c.startsWith("@") ? `https://t.me/${c.slice(1)}` : "";
}

// Проверка подписки включена, только если задан канал
export const gateEnabled = () => Boolean(channelId());

export async function tg<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = botToken();
  if (!token) throw new TgError("Не задан TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
  if (!j.ok) throw new TgError(j.description ?? `Telegram ${r.status}`, j.error_code);
  return j.result as T;
}

type Member = { status: string; is_member?: boolean };

// true — подписан, false — нет. Ошибку (бот не админ канала, сбой Telegram) бросаем: решение, что делать, принимает вызывающий.
export async function isSubscribed(userId: number): Promise<boolean> {
  if (!gateEnabled()) return true;
  const m = await tg<Member>("getChatMember", { chat_id: channelId(), user_id: userId });
  return m.status === "creator" || m.status === "administrator" || m.status === "member" || (m.status === "restricted" && m.is_member === true);
}
