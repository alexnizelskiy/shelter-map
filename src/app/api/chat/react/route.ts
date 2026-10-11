import { json, readJson } from "@/lib/api-utils";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { currentUser, isBanned } from "@/lib/chat-db";
import { REACTIONS } from "@/lib/chat-meta";


export async function POST(req: Request) {
  const body = await readJson(req);
  const id = Number(body?.messageId);
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  if (!Number.isInteger(id) || !REACTIONS.includes(emoji)) return json({ error: "Некорректный запрос" }, 400);
  if (!dbConfigured()) return json({ error: "Чат не подключён" }, 503);
  await ensureSchema();
  const me = await currentUser();
  if (!me) return json({ error: "Войдите, чтобы ставить реакции" }, 401);
  if (isBanned(me)) return json({ error: "Недоступно" }, 403);
  const del = await sql()`DELETE FROM chat_reactions WHERE message_id = ${id} AND user_id = ${me.id} AND emoji = ${emoji} RETURNING 1`;
  if (!del.length) {
    // одна реакция каждого вида на сообщение, не более трёх разных от одного человека
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM chat_reactions WHERE message_id = ${id} AND user_id = ${me.id}`;
    if (n >= 3) return json({ error: "Не более трёх реакций на сообщение" }, 400);
    await sql()`INSERT INTO chat_reactions (message_id, user_id, emoji) SELECT ${id}, ${me.id}, ${emoji} WHERE EXISTS (SELECT 1 FROM chat_messages WHERE id = ${id} AND NOT deleted) ON CONFLICT DO NOTHING`;
  }
  return json({ ok: true });
}
