import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api-utils";
import { handleMaxUpdate, type MaxUpdate } from "@/lib/max-bot";
import { maxAnswer, maxChannelLink, maxGateEnabled, maxIsSubscribed, maxSend, maxUrgentEnabled, maxWebhookSecret } from "@/lib/max";
import { markBlocked, trackSafe } from "@/lib/bot-users";
import { siteOrigin } from "@/lib/chat-auth";
import { forgetMaxChat, rememberMaxChat } from "@/lib/max-chats";

const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

// Вебхук MAX. Принимаем только запросы с секретным заголовком, который мы сами задали при подписке.
export async function POST(req: Request) {
  const secret = maxWebhookSecret();
  if (!secret) return json({ error: "MAX_WEBHOOK_SECRET не задан" }, 503);
  if (!same(req.headers.get("x-max-bot-api-secret") ?? "", secret)) return json({ error: "forbidden" }, 403);

  let update: MaxUpdate;
  try { update = (await req.json()) as MaxUpdate; } catch { return json({ ok: true }); }

  // каналы и чаты, где состоит бот: их id нужен для MAX_CHANNEL_ID, а получить его можно только из событий
  try {
    const rec = update.message?.recipient;
    if (update.update_type === "bot_added" && update.chat_id != null) await rememberMaxChat(update.chat_id, update.is_channel ? "channel" : "chat");
    else if (update.update_type === "bot_removed" && update.chat_id != null) await forgetMaxChat(update.chat_id);
    else if (update.update_type === "message_created" && rec?.chat_id != null && rec.chat_type && rec.chat_type !== "dialog") await rememberMaxChat(rec.chat_id, rec.chat_type);
  } catch (e) { console.error("max chats", e); }

  try {
    await handleMaxUpdate(update, {
      send: (userId, text, rows) => maxSend(userId, text, rows),
      answer: (id, text) => maxAnswer(id, text),
      subscribed: (id) => maxIsSubscribed(id),
      track: async (e) => { await trackSafe({ platform: "max", extId: e.userId, chatId: e.chatId ?? e.userId, source: e.source, kind: e.kind, lang: e.lang, started: true }); },
      blocked: (id) => markBlocked("max", id).catch((e) => console.error("max blocked", e)),
      origin: siteOrigin(req),
      channelLink: maxChannelLink(),
      gate: maxGateEnabled(),
      urgent: maxUrgentEnabled(),
      log: (msg, e) => console.error("max bot:", msg, e),
    });
  } catch (e) {
    // всегда отвечаем 200: иначе MAX будет повторять доставку (до 10 раз)
    console.error("max bot handler", e);
  }
  return json({ ok: true });
}
