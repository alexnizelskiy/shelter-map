import { json, readJson } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { verifyTelegramWidget } from "@/lib/chat-auth";
import { loginIdentity, setSessionCookie } from "@/lib/chat-db";
import { dbConfigured } from "@/lib/db";

// Вход через виджет Telegram: подпись проверяем токеном бота
export async function POST(req: Request) {
  if (!dbConfigured()) return json({ error: "База не подключена" }, 503);
  const body = await readJson(req);
  const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  if (!body || !token) return json({ error: "Вход через Telegram не настроен" }, 400);
  const id = verifyTelegramWidget(body as Record<string, string | number>, token);
  if (!id) return json({ error: "Не удалось проверить данные Telegram" }, 401);
  const { cookie } = await loginIdentity(id);
  await setSessionCookie(cookie);
  return json({ ok: true });
}
