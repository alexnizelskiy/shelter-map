import { connection } from "next/server";
import { clean, ipHash, json, readJson } from "@/lib/api-utils";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { providerConfig, displayName } from "@/lib/chat-auth";
import { currentUser, isBanned, maintainChat } from "@/lib/chat-db";
import { CHAT_MAX_LEN as MAX_LEN } from "@/lib/chat-meta";

const LIMIT = 80;
const LINK_RE = /(https?:\/\/|www\.|t\.me\/|vk\.com\/|@\w{4,}|\b[\w-]+\.(ru|com|net|org|su|me|io|рф)\b)/i;

type Row = {
  id: string; user_id: string; text: string; created_at: Date; reply_to: string | null;
  first_name: string; last_initial: string; avatar_url: string | null; role: string;
  r_text: string | null; r_first: string | null; r_initial: string | null;
};

export async function GET(req: Request) {
  await connection();
  const room = clean(new URL(req.url).searchParams.get("room"), 60);
  if (!room) return json({ error: "Не указана комната" }, 400);
  const providers = providerConfig();
  if (!dbConfigured()) return json({ enabled: false, reason: "no_db", providers, messages: [], me: null });

  try {
    await ensureSchema();
    const meta = await maintainChat();
    const me = await currentUser();

    // присутствие: сколько человек сейчас открыли чат (по последним 90 секундам)
    const visitor = me ? `u${me.id}` : `a${ipHash(req)}`;
    await sql()`INSERT INTO chat_presence (visitor, seen) VALUES (${visitor}, now()) ON CONFLICT (visitor) DO UPDATE SET seen = now() WHERE chat_presence.seen < now() - interval '20 seconds'`;
    const [{ n: online }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM chat_presence WHERE seen > now() - interval '90 seconds'`;

    const rows = meta.enabled ? await sql()<Row[]>`
      SELECT m.id::text, m.user_id::text, m.text, m.created_at, m.reply_to::text, u.first_name, u.last_initial, u.avatar_url, u.role,
             r.text AS r_text, ru.first_name AS r_first, ru.last_initial AS r_initial
      FROM chat_messages m
      JOIN chat_users u ON u.id = m.user_id
      LEFT JOIN chat_messages r ON r.id = m.reply_to AND NOT r.deleted
      LEFT JOIN chat_users ru ON ru.id = r.user_id
      WHERE m.room = ${room} AND NOT m.deleted
      ORDER BY m.id DESC LIMIT ${LIMIT}` : [];

    const ids = rows.map((r) => Number(r.id));
    const reacts = ids.length ? await sql()<{ message_id: string; emoji: string; n: number; mine: boolean }[]>`
      SELECT message_id::text, emoji, count(*)::int AS n, bool_or(user_id = ${me?.id ?? 0}) AS mine
      FROM chat_reactions WHERE message_id = ANY(${ids}::bigint[]) GROUP BY message_id, emoji` : [];

    const messages = rows.reverse().map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      name: displayName(r.first_name, r.last_initial),
      avatar: r.avatar_url,
      moderator: r.role === "moderator",
      text: r.text,
      at: r.created_at.toISOString(),
      reply: r.reply_to && r.r_text ? { id: Number(r.reply_to), name: displayName(r.r_first ?? "", r.r_initial ?? ""), text: r.r_text.slice(0, 120) } : null,
      reactions: reacts.filter((x) => x.message_id === r.id).map((x) => ({ emoji: x.emoji, n: x.n, mine: x.mine })),
    }));

    return json({
      enabled: meta.enabled, providers, online, messages,
      clearHours: meta.clearHours, nextClearAt: meta.nextClearAt,
      me: me ? { id: me.id, name: displayName(me.firstName, me.lastInitial), avatar: me.avatar, banned: isBanned(me) } : null,
    }, 200, { "Cache-Control": "private, no-store" });
  } catch (e) {
    console.error("chat GET", e);
    return json({ enabled: false, reason: "error", code: (e as { code?: string }).code ?? "unknown", providers: providerConfig(), messages: [], me: null });
  }
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  if (!dbConfigured()) return json({ error: "Чат не подключён" }, 503);
  const room = clean(body.room, 60);
  const text = clean(body.text, MAX_LEN);
  const replyTo = Number(body.replyTo);
  if (!room || !text) return json({ error: "Введите сообщение" }, 400);

  try {
    await ensureSchema();
    const meta = await maintainChat();
    if (!meta.enabled) return json({ error: "Чат временно отключён" }, 403);
    const me = await currentUser();
    if (!me) return json({ error: "Войдите, чтобы писать" }, 401);
    if (isBanned(me)) return json({ error: "Вы не можете писать в чат" }, 403);
    if (me.role !== "moderator" && LINK_RE.test(text)) return json({ error: "Ссылки и контакты в чате запрещены" }, 400);

    // защита от спама: не чаще раза в 2 секунды, не более 15 в минуту, без повтора одного текста за 30 секунд
    const [lim] = await sql()<{ last: number | null; minute: number; same: number }[]>`
      SELECT extract(epoch FROM now() - max(created_at))::float AS last,
             count(*) FILTER (WHERE created_at > now() - interval '1 minute')::int AS minute,
             count(*) FILTER (WHERE text = ${text} AND created_at > now() - interval '30 seconds')::int AS same
      FROM chat_messages WHERE user_id = ${me.id}`;
    if (lim.last !== null && lim.last < 2) return json({ error: "Слишком часто. Подождите пару секунд." }, 429);
    if (lim.minute >= 15) return json({ error: "Слишком много сообщений. Подождите минуту." }, 429);
    if (lim.same > 0) return json({ error: "Это сообщение вы только что отправляли." }, 429);

    const reply = Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null;
    await sql()`INSERT INTO chat_messages (room, user_id, text, reply_to) VALUES (${room}, ${me.id}, ${text}, ${reply})`;
    return json({ ok: true });
  } catch (e) {
    console.error("chat POST", e);
    return json({ error: "Не удалось отправить.", code: (e as { code?: string }).code ?? "unknown" }, 500);
  }
}
