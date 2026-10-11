import { cookies } from "next/headers";
import { json } from "@/lib/api-utils";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/chat-auth";
import { currentUser } from "@/lib/chat-db";

// Пользователь сам удаляет свой профиль: вместе с сообщениями, реакциями и жалобами (каскад в базе)
export async function POST() {
  if (!dbConfigured()) return json({ error: "Чат не подключён" }, 503);
  await ensureSchema();
  const me = await currentUser();
  if (!me) return json({ error: "Вы не вошли" }, 401);
  await sql()`DELETE FROM chat_users WHERE id = ${me.id}`;
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
