import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { safeReturn, siteOrigin } from "@/lib/chat-auth";
import { hasConsent, loginIdentity, setSessionCookie } from "@/lib/chat-db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  let saved: { state?: string; verifier?: string; back?: string } = {};
  try { saved = JSON.parse(jar.get("oauth_vk")?.value ?? "{}"); } catch {}
  jar.delete("oauth_vk");
  const back = safeReturn(saved.back);
  const origin = siteOrigin(req);
  const fail = (why: string) => NextResponse.redirect(`${origin}${back}${back.includes("?") ? "&" : "?"}login_error=${why}`);

  if (!(await hasConsent())) return fail("consent");
  // результат приходит в параметре payload (JSON) либо отдельными параметрами
  let code = url.searchParams.get("code");
  let state = url.searchParams.get("state");
  let deviceId = url.searchParams.get("device_id");
  const payload = url.searchParams.get("payload");
  if (payload) { try { const p = JSON.parse(payload); code = p.code ?? code; state = p.state ?? state; deviceId = p.device_id ?? deviceId; } catch {} }
  if (!code || !deviceId || !saved.state || !saved.verifier || state !== saved.state) return fail("state");

  const clientId = cleanEnv(process.env.VK_CLIENT_ID);
  try {
    const tok = await fetch("https://id.vk.ru/oauth2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, code_verifier: saved.verifier, client_id: clientId, device_id: deviceId,
        redirect_uri: `${origin}/api/auth/vk/callback`, state: saved.state,
      }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json());
    if (!tok.access_token) return fail("token");
    const info = await fetch("https://id.vk.ru/oauth2/user_info", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, access_token: tok.access_token }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json());
    const u = info.user;
    if (!u?.user_id) return fail("profile");
    const { cookie } = await loginIdentity({ provider: "vk", extId: String(u.user_id), firstName: u.first_name ?? "", lastName: u.last_name ?? "", avatar: u.avatar ?? null });
    await setSessionCookie(cookie);
    return NextResponse.redirect(`${origin}${back}`);
  } catch (e) {
    console.error("vk login", e);
    return fail("network");
  }
}
