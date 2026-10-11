import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { pkceChallenge, randomToken, safeReturn, siteOrigin } from "@/lib/chat-auth";

// VK ID, OAuth 2.1 с PKCE: https://id.vk.ru/authorize
export async function GET(req: Request) {
  const clientId = cleanEnv(process.env.VK_CLIENT_ID);
  if (!clientId) return new NextResponse("Вход через VK ID не настроен", { status: 400 });
  const state = randomToken(24); // 32 символа
  const verifier = randomToken(48);
  const back = safeReturn(new URL(req.url).searchParams.get("return"));
  (await cookies()).set("oauth_vk", JSON.stringify({ state, verifier, back }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  const redirect = `${siteOrigin(req)}/api/auth/vk/callback`;
  const q = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: redirect, state,
    code_challenge: pkceChallenge(verifier), code_challenge_method: "S256", scope: "vkid.personal_info",
  });
  return NextResponse.redirect(`https://id.vk.ru/authorize?${q}`);
}
