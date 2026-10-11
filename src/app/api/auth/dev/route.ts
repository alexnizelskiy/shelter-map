import { json, readJson, clean } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { hasConsent, loginIdentity, setSessionCookie } from "@/lib/chat-db";
import { dbConfigured } from "@/lib/db";

// Тестовый вход без внешних сервисов. Работает только при CHAT_DEV_LOGIN=1 (в боевой среде не включайте).
export async function POST(req: Request) {
  if (cleanEnv(process.env.CHAT_DEV_LOGIN) !== "1") return json({ error: "Отключено" }, 404);
  if (!dbConfigured()) return json({ error: "База не подключена" }, 503);
  if (!(await hasConsent())) return json({ error: "Нужно согласие на обработку данных" }, 400);
  const body = await readJson(req);
  const name = clean(body?.name, 40) || "Тест Тестов";
  const [first, ...rest] = name.split(" ");
  const { cookie } = await loginIdentity({ provider: "dev", extId: `dev-${name.toLowerCase()}`, firstName: first, lastName: rest.join(" "), avatar: null });
  await setSessionCookie(cookie);
  return json({ ok: true });
}
