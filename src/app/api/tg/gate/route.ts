import { json, readJson } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { verifyWebAppData } from "@/lib/chat-auth";
import { channelLink, gateEnabled, isSubscribed, urgentEnabled } from "@/lib/telegram";

// Вход в мини-приложение Telegram: подписан ли человек на канал. initData проверяется подписью токена бота.
export async function POST(req: Request) {
  const body = await readJson(req);
  const initData = typeof body?.initData === "string" ? body.initData : "";
  const link = channelLink();
  const urgent = urgentEnabled();
  if (!gateEnabled()) return json({ ok: true, gate: false });

  const id = verifyWebAppData(initData, cleanEnv(process.env.TELEGRAM_BOT_TOKEN), "telegram");
  if (!id) return json({ ok: false, reason: "invalid", link, urgent }, 401);

  try {
    const sub = await isSubscribed(Number(id.extId));
    return json({ ok: sub, reason: sub ? undefined : "not_subscribed", link, urgent });
  } catch (e) {
    // проверить не удалось (бот не админ канала, сбой Telegram): пускаем, чтобы не закрыть доступ в тревожный момент
    console.error("tg gate", e);
    return json({ ok: true, degraded: true });
  }
}
