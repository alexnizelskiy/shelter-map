import { connection } from "next/server";
import { json } from "@/lib/api-utils";
import { dbConfigured } from "@/lib/db";
import { publicKey } from "@/lib/push";

// Открытый ключ для подписки браузера на уведомления
export async function GET() {
  await connection();
  if (!dbConfigured()) return json({ enabled: false });
  try { return json({ enabled: true, publicKey: await publicKey() }); }
  catch (e) { console.error("push config", e); return json({ enabled: false }); }
}
