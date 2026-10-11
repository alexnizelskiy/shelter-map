import { json, readJson } from "@/lib/api-utils";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { currentUser } from "@/lib/chat-db";

// Автор может удалить своё сообщение
export async function POST(req: Request) {
  const body = await readJson(req);
  const id = Number(body?.messageId);
  if (!Number.isInteger(id)) return json({ error: "Некорректный запрос" }, 400);
  if (!dbConfigured()) return json({ error: "Чат не подключён" }, 503);
  await ensureSchema();
  const me = await currentUser();
  if (!me) return json({ error: "Войдите" }, 401);
  await sql()`UPDATE chat_messages SET deleted = true WHERE id = ${id} AND user_id = ${me.id}`;
  return json({ ok: true });
}
