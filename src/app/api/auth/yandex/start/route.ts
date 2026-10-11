import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { randomToken, safeReturn, siteOrigin } from "@/lib/chat-auth";

export async function GET(req: Request) {
  const clientId = cleanEnv(process.env.YANDEX_CLIENT_ID);
  if (!clientId) return new NextResponse("Вход через Яндекс ID не настроен", { status: 400 });
  const state = randomToken(24);
  const back = safeReturn(new URL(req.url).searchParams.get("return"));
  (await cookies()).set("oauth_yandex", JSON.stringify({ state, back }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  const redirect = `${siteOrigin(req)}/api/auth/yandex/callback`;
  return NextResponse.redirect(`https://oauth.yandex.ru/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`);
}
