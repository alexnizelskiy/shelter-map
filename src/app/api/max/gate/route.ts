import { json, readJson } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { verifyWebAppData } from "@/lib/chat-auth";
import { cleanSource, trackSafe } from "@/lib/bot-users";
import { dbConfigured } from "@/lib/db";
import { maxChannelLink, maxGateEnabled, maxIsSubscribed, maxUrgentEnabled } from "@/lib/max";

// Вход в мини-приложение MAX: учитываем открытие и проверяем подписку на канал. initData проверяется подписью токена бота.
export async function POST(req: Request) {
  const body = await readJson(req);
  const initData = typeof body?.initData === "string" ? body.initData : "";
  const link = maxChannelLink();
  const urgent = maxUrgentEnabled();

  const id = verifyWebAppData(initData, cleanEnv(process.env.MAX_BOT_TOKEN), "max");
  if (id && dbConfigured()) await trackSafe({ platform: "max", extId: id.extId, source: cleanSource(body?.startParam), kind: "open" });

  if (!maxGateEnabled()) return json({ ok: true, gate: false });
  if (!id) return json({ ok: false, reason: "invalid", link, urgent }, 401);

  try {
    const sub = await maxIsSubscribed(id.extId);
    if (dbConfigured()) await trackSafe({ platform: "max", extId: id.extId, kind: sub ? "sub_ok" : "sub_no" });
    return json({ ok: sub, reason: sub ? undefined : "not_subscribed", link, urgent });
  } catch (e) {
    // проверить не удалось (бот не админ канала, сбой MAX): пускаем, чтобы не закрыть доступ в тревожный момент
    console.error("max gate", e);
    return json({ ok: true, degraded: true });
  }
}
