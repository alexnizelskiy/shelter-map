import { ensureSchema, sql } from "./db";

// MAX не отдаёт список каналов и чатов бота: числовой id приходит только в событиях (бота добавили, в канале появилось сообщение).
// Запоминаем такие id в chat_settings (ключ max_chat:<id>), админка показывает их, чтобы скопировать MAX_CHANNEL_ID.
const PREFIX = "max_chat:";

export async function rememberMaxChat(id: number | string, type: string): Promise<void> {
  const key = `${PREFIX}${String(id).replace(/[^0-9-]/g, "").slice(0, 24)}`;
  if (key === PREFIX) return;
  await ensureSchema();
  await sql()`INSERT INTO chat_settings (key, value) VALUES (${key}, ${JSON.stringify({ type, at: Date.now() })})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

export async function forgetMaxChat(id: number | string): Promise<void> {
  await ensureSchema();
  await sql()`DELETE FROM chat_settings WHERE key = ${`${PREFIX}${String(id)}`}`;
}

export type SeenChat = { id: string; type: string; at: number };

export async function listMaxChats(): Promise<SeenChat[]> {
  await ensureSchema();
  const rows = await sql()<{ key: string; value: string }[]>`SELECT key, value FROM chat_settings WHERE key LIKE ${`${PREFIX}%`} LIMIT 50`;
  return rows
    .map((r) => { try { const v = JSON.parse(r.value); return { id: r.key.slice(PREFIX.length), type: String(v.type ?? "chat"), at: Number(v.at ?? 0) }; } catch { return null; } })
    .filter((x): x is SeenChat => x !== null)
    .sort((a, b) => b.at - a.at);
}
