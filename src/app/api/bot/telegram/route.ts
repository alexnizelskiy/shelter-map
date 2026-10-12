import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api-utils";
import { handleUpdate, type Update } from "@/lib/bot";
import { channelLink, gateEnabled, isSubscribed, tg, urgentEnabled, webhookSecret } from "@/lib/telegram";
import { siteOrigin } from "@/lib/chat-auth";

const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

// Вебхук Telegram. Принимаем только запросы с секретным заголовком, который мы сами задали при установке вебхука.
export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret) return json({ error: "TELEGRAM_WEBHOOK_SECRET не задан" }, 503);
  if (!same(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) return json({ error: "forbidden" }, 403);

  let update: Update;
  try { update = (await req.json()) as Update; } catch { return json({ ok: true }); }

  try {
    await handleUpdate(update, {
      api: (method, params) => tg(method, params),
      subscribed: isSubscribed,
      origin: siteOrigin(req),
      channelLink: channelLink(),
      gate: gateEnabled(),
      urgent: urgentEnabled(),
      log: (msg, e) => console.error("bot:", msg, e),
    });
  } catch (e) {
    // всегда отвечаем 200, иначе Telegram будет повторять доставку того же обновления
    console.error("bot handler", e);
  }
  return json({ ok: true });
}
