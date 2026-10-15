import { cookies } from "next/headers";
import { ipHash, json } from "@/lib/api-utils";
import { dbConfigured } from "@/lib/db";
import { hasConsent } from "@/lib/chat-db";
import { LOGIN_COOKIE, LOGIN_TTL_MIN, createLoginCode } from "@/lib/login-codes";
import { maxToken, maxUsername } from "@/lib/max";

// Начало входа в чат через бота MAX: создаём одноразовый код и отдаём ссылку на бота
export async function POST(req: Request) {
  if (!dbConfigured()) return json({ error: "База не подключена" }, 503);
  if (!maxToken() || !maxUsername()) return json({ error: "Вход через MAX не настроен" }, 400);
  if (!(await hasConsent())) return json({ error: "Нужно согласие на обработку данных" }, 400);
  const code = await createLoginCode("max", ipHash(req));
  if (!code) return json({ error: "Слишком много попыток. Подождите немного." }, 429);
  (await cookies()).set(LOGIN_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: LOGIN_TTL_MIN * 60 });
  return json({ ok: true, code, link: `https://max.ru/${maxUsername()}?start=login_${code}`, minutes: LOGIN_TTL_MIN });
}
