import { cookies } from "next/headers";
import { json } from "@/lib/api-utils";
import { SESSION_COOKIE } from "@/lib/chat-auth";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
