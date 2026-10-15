import { cookies } from "next/headers";
import { json } from "@/lib/api-utils";
import { dbConfigured } from "@/lib/db";
import { hasConsent, loginIdentity, setSessionCookie } from "@/lib/chat-db";
import { LOGIN_COOKIE, claimLoginCode } from "@/lib/login-codes";

// Сайт спрашивает, подтвердил ли бот вход. Код берётся из куки браузера, который начал вход.
export async function GET() {
  if (!dbConfigured()) return json({ error: "База не подключена" }, 503);
  const jar = await cookies();
  const code = jar.get(LOGIN_COOKIE)?.value ?? "";
  if (!code) return json({ state: "expired" });
  const r = await claimLoginCode(code);
  if (r.state !== "ok") {
    if (r.state === "expired") jar.delete(LOGIN_COOKIE);
    return json({ state: r.state });
  }
  jar.delete(LOGIN_COOKIE);
  if (!(await hasConsent())) return json({ error: "Нужно согласие на обработку данных" }, 400);
  const { cookie } = await loginIdentity({ provider: r.who.provider, extId: r.who.extId, firstName: r.who.firstName, lastName: r.who.lastName, avatar: r.who.avatar });
  await setSessionCookie(cookie);
  return json({ state: "ok" });
}
