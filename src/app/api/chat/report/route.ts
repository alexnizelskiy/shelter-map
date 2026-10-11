import { json, readJson } from "@/lib/api-utils";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { currentUser } from "@/lib/chat-db";

// Жалоба на сообщение: попадает в очередь модератора в админке
export async function POST(req: Request) {
  const body = await readJson(req);
  const id = Number(body?.messageId);
  if (!Number.isInteger(id)) return json({ error: "Некорректный запрос" }, 400);
  if (!dbConfigured()) return json({ error: "Чат не подключён" }, 503);
  await ensureSchema();
  const me = await currentUser();
  if (!me) return json({ error: "Войдите, чтобы пожаловаться" }, 401);
  await sql()`INSERT INTO chat_reports (message_id, user_id) SELECT ${id}, ${me.id} WHERE EXISTS (SELECT 1 FROM chat_messages WHERE id = ${id}) ON CONFLICT DO NOTHING`;
  return json({ ok: true });
}
