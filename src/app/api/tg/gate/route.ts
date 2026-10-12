import { json, readJson } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { verifyWebAppData } from "@/lib/chat-auth";
import { channelLink, gateEnabled, isSubscribed, urgentEnabled } from "@/lib/telegram";
import { cleanSource, trackSafe } from "@/lib/bot-users";
import { dbConfigured } from "@/lib/db";

// Вход в мини-приложение Telegram: подписан ли человек на канал. initData проверяется подписью токена бота.
export async function POST(req: Request) {
  const body = await readJson(req);
  const initData = typeof body?.initData === "string" ? body.initData : "";
  const link = channelLink();
  const urgent = urgentEnabled();
  const id = verifyWebAppData(initData, cleanEnv(process.env.TELEGRAM_BOT_TOKEN), "telegram");
  // учёт открытия мини-приложения (и метки ссылки t.me/бот?startapp=метка); сбой учёта вход не ломает
  if (id && dbConfigured()) await trackSafe({ platform: "telegram", extId: id.extId, chatId: id.extId, source: cleanSource(body?.startParam), kind: "open" });

  if (!gateEnabled()) return json({ ok: true, gate: false });
  if (!id) return json({ ok: false, reason: "invalid", link, urgent }, 401);

  try {
    const sub = await isSubscribed(Number(id.extId));
    if (dbConfigured()) await trackSafe({ platform: "telegram", extId: id.extId, chatId: id.extId, kind: sub ? "sub_ok" : "sub_no" });
    return json({ ok: sub, reason: sub ? undefined : "not_subscribed", link, urgent });
  } catch (e) {
    // проверить не удалось (бот не админ канала, сбой Telegram): пускаем, чтобы не закрыть доступ в тревожный момент
    console.error("tg gate", e);
    return json({ ok: true, degraded: true });
  }
}
