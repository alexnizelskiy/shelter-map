import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { safeReturn, siteOrigin } from "@/lib/chat-auth";
import { hasConsent, loginIdentity, setSessionCookie } from "@/lib/chat-db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  let saved: { state?: string; back?: string } = {};
  try { saved = JSON.parse(jar.get("oauth_yandex")?.value ?? "{}"); } catch {}
  jar.delete("oauth_yandex");
  const back = safeReturn(saved.back);
  const origin = siteOrigin(req);
  const fail = (why: string) => NextResponse.redirect(`${origin}${back}${back.includes("?") ? "&" : "?"}login_error=${why}`);

  if (!(await hasConsent())) return fail("consent");
  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) return fail("state");
  try {
    const tok = await fetch("https://oauth.yandex.ru/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: cleanEnv(process.env.YANDEX_CLIENT_ID), client_secret: cleanEnv(process.env.YANDEX_CLIENT_SECRET) }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json());
    if (!tok.access_token) return fail("token");
    const info = await fetch("https://login.yandex.ru/info?format=json", { headers: { Authorization: `OAuth ${tok.access_token}` }, signal: AbortSignal.timeout(10000) }).then((r) => r.json());
    if (!info.id) return fail("profile");
    const { cookie } = await loginIdentity({
      provider: "yandex", extId: String(info.id), firstName: info.first_name || info.display_name || "", lastName: info.last_name || "",
      avatar: info.is_avatar_empty || !info.default_avatar_id ? null : `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`,
    });
    await setSessionCookie(cookie);
    return NextResponse.redirect(`${origin}${back}`);
  } catch (e) {
    console.error("yandex login", e);
    return fail("network");
  }
}
