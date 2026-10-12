import { sql } from "./db";
import { TgError, tg } from "./telegram";
import { MaxError, maxSend } from "./max";
import { markBlockedById } from "./bot-users";

// Рассылка уведомлений людям, которые запускали бота. Получатели: started, не отключили (/stop), не заблокировали бота.
export const FOOTER = "\n\nОтключить такие сообщения: /stop";
export const MAX_TEXT = 3500;

export type Audience = { platform: string; n: number };

export async function audience(source: string | null): Promise<Audience[]> {
  return sql()<Audience[]>`
    SELECT platform, count(*)::int AS n FROM bot_users
    WHERE started AND notify AND NOT blocked AND chat_id IS NOT NULL AND (${source}::text IS NULL OR source = ${source})
    GROUP BY platform ORDER BY platform`;
}

export const isHttps = (u: string) => /^https:\/\/[^\s]+$/i.test(u) && u.length <= 500;

type Target = { id: string; platform: "telegram" | "max"; chat_id: string };
type B = { text: string; button_text: string | null; button_url: string | null };

// Результат одной отправки: ok / blocked (получатель недоступен) / retry (лимит API: остановить партию) / fail
export type SendResult = { state: "sent" | "blocked" | "failed"; error?: string; retry?: boolean };

export async function sendOne(t: { platform: "telegram" | "max"; chat_id: string }, b: B): Promise<SendResult> {
  const text = `${b.text}${FOOTER}`;
  try {
    if (t.platform === "telegram") {
      await tg("sendMessage", {
        chat_id: t.chat_id, text, disable_web_page_preview: true,
        ...(b.button_text && b.button_url ? { reply_markup: { inline_keyboard: [[{ text: b.button_text, url: b.button_url }]] } } : {}),
      });
    } else {
      await maxSend(t.chat_id, text, b.button_text && b.button_url ? [[{ type: "link", text: b.button_text, url: b.button_url }]] : []);
    }
    return { state: "sent" };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    if (e instanceof TgError) {
      if (e.code === 429) return { state: "failed", error: msg, retry: true };
      if (e.code === 403 || (e.code === 400 && /chat not found|user is deactivated|bot was blocked/i.test(msg))) return { state: "blocked", error: msg };
    }
    if (e instanceof MaxError) {
      if (e.status === 429) return { state: "failed", error: msg, retry: true };
      if (e.status === 403 || e.status === 404) return { state: "blocked", error: msg };
    }
    return { state: "failed", error: msg };
  }
}

export type Progress = { id: number; total: number; sent: number; failed: number; blocked: number; pending: number; status: string };

export async function progress(id: number): Promise<Progress | null> {
  const [r] = await sql()<Progress[]>`
    SELECT b.id::int AS id, b.total, b.status,
      count(d.*) FILTER (WHERE d.state = 'sent')::int AS sent,
      count(d.*) FILTER (WHERE d.state = 'failed')::int AS failed,
      count(d.*) FILTER (WHERE d.state = 'blocked')::int AS blocked,
      count(d.*) FILTER (WHERE d.state = 'pending')::int AS pending
    FROM broadcasts b LEFT JOIN broadcast_deliveries d ON d.broadcast_id = b.id WHERE b.id = ${id} GROUP BY b.id`;
  return r ?? null;
}

// Отправляет очередную партию в пределах бюджета времени. Возвращает прогресс; retry = упёрлись в лимит API, подождать.
export async function runBatch(id: number, budgetMs = 7000): Promise<{ progress: Progress | null; retry: boolean }> {
  const [b] = await sql()<(B & { status: string })[]>`SELECT text, button_text, button_url, status FROM broadcasts WHERE id = ${id}`;
  if (!b || b.status !== "sending") return { progress: await progress(id), retry: false };
  const until = Date.now() + budgetMs;
  let retry = false;
  while (Date.now() < until && !retry) {
    const batch = await sql()<Target[]>`
      SELECT u.id::text, u.platform, u.chat_id FROM broadcast_deliveries d JOIN bot_users u ON u.id = d.user_id
      WHERE d.broadcast_id = ${id} AND d.state = 'pending' ORDER BY d.user_id LIMIT 20`;
    if (!batch.length) break;
    for (let i = 0; i < batch.length && !retry; i += 10) {
      const part = batch.slice(i, i + 10);
      const res = await Promise.all(part.map((t) => sendOne(t, b)));
      for (let k = 0; k < part.length; k++) {
        const r = res[k];
        if (r.retry) { retry = true; continue; } // останется в очереди: отправим позже
        await sql()`UPDATE broadcast_deliveries SET state = ${r.state}, error = ${r.error ?? null}, sent_at = CASE WHEN ${r.state} = 'sent' THEN now() ELSE NULL END WHERE broadcast_id = ${id} AND user_id = ${Number(part[k].id)}`;
        if (r.state === "blocked") await markBlockedById(Number(part[k].id));
      }
    }
  }
  const p = await progress(id);
  if (p && p.pending === 0) await sql()`UPDATE broadcasts SET status = 'done', finished_at = now() WHERE id = ${id} AND status = 'sending'`;
  return { progress: p ? { ...p, status: p.pending === 0 ? "done" : p.status } : null, retry };
}
