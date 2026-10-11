import { json, readJson } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { verifyWebAppData } from "@/lib/chat-auth";
import { hasConsent, loginIdentity, setSessionCookie } from "@/lib/chat-db";
import { dbConfigured } from "@/lib/db";

// Вход внутри мини-приложения Telegram или MAX: initData подписан токеном бота
export async function POST(req: Request) {
  if (!dbConfigured()) return json({ error: "База не подключена" }, 503);
  if (!(await hasConsent())) return json({ error: "Нужно согласие на обработку данных" }, 400);
  const body = await readJson(req);
  const provider = body?.provider === "max" ? "max" : body?.provider === "telegram" ? "telegram" : null;
  const initData = typeof body?.initData === "string" ? body.initData : "";
  if (!provider || !initData) return json({ error: "Некорректный запрос" }, 400);
  const token = cleanEnv(provider === "max" ? process.env.MAX_BOT_TOKEN : process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return json({ error: "Вход не настроен" }, 400);
  const id = verifyWebAppData(initData, token, provider);
  if (!id) return json({ error: "Не удалось проверить данные мессенджера" }, 401);
  const { cookie } = await loginIdentity(id);
  await setSessionCookie(cookie);
  return json({ ok: true });
}
