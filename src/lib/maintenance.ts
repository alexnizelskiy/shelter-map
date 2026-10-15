import { sql } from "./db";
import { RETENTION } from "./operator";

const R = RETENTION;

// Запросы очистки сроков хранения (общий список: его же гоняет автотест на встроенной базе)
export const PURGE_SQL = [
  `DELETE FROM shelter_reports WHERE created_at < now() - interval '${R.reportsDays} days'`,
  `DELETE FROM suggestions WHERE state = 'rejected' AND created_at < now() - interval '${R.suggestionsRejectedDays} days'`,
  // хэш IP нужен только для защиты от накруток: через срок стираем его там, где запись остаётся
  `UPDATE suggestions SET ip_hash = '' WHERE ip_hash <> '' AND created_at < now() - interval '${R.ipHashDays} days'`,
  `UPDATE shelter_photos SET ip_hash = '' WHERE ip_hash <> '' AND created_at < now() - interval '${R.ipHashDays} days'`,
  `DELETE FROM admin_attempts WHERE created_at < now() - interval '${R.adminAttemptsDays} days'`,
  `DELETE FROM chat_presence WHERE seen < now() - interval '1 day'`,
  `DELETE FROM chat_users WHERE last_seen < now() - interval '${R.chatProfileInactiveMonths} months' AND (banned_until IS NULL OR banned_until < now())`,
  `DELETE FROM data_requests WHERE state = 'done' AND closed_at < now() - interval '${R.dataRequestDoneMonths} months'`,
  `DELETE FROM access_suggestions WHERE state <> 'new' AND created_at < now() - interval '${R.ipHashDays} days'`,
  `UPDATE access_suggestions SET ip_hash = '' WHERE ip_hash <> '' AND created_at < now() - interval '${R.ipHashDays} days'`,
  `DELETE FROM shelter_photos WHERE state = 'rejected' AND reviewed_at < now() - interval '7 days'`,
  // боты и аналитика: неактивные подписчики, счётчики посещений, события и журнал рассылок
  `DELETE FROM bot_users WHERE last_seen < now() - interval '${R.botUserInactiveMonths} months'`,
  `DELETE FROM site_hits WHERE day < current_date - ${R.siteHitsDays}`,
  `DELETE FROM bot_events WHERE created_at < now() - interval '${R.botEventsDays} days'`,
  `DELETE FROM bot_activity WHERE day < current_date - ${R.siteHitsDays}`,
  `DELETE FROM push_subscriptions WHERE fails >= 5 OR last_ok < now() - interval '12 months'`,
  `DELETE FROM radar_posts WHERE posted_at < now() - interval '2 days'`,
  `DELETE FROM login_codes WHERE created_at < now() - interval '1 day'`,
  `DELETE FROM broadcasts WHERE created_at < now() - interval '${R.broadcastDays} days'`,
];

// Раз в сутки удаляет данные, срок хранения которых вышел. Запускается лениво при обращении к чату и отметкам.
export async function dailyMaintenance(): Promise<void> {
  const now = Date.now();
  const [row] = await sql()<{ value: string }[]>`SELECT value FROM chat_settings WHERE key = 'last_maintenance'`;
  const last = Number(row?.value ?? 0);
  if (now - last < 86400_000) return;
  // сравнение-и-замена: выполнит только один из параллельных запросов
  const claimed = row
    ? await sql()`UPDATE chat_settings SET value = ${String(now)} WHERE key = 'last_maintenance' AND value = ${row.value} RETURNING key`
    : await sql()`INSERT INTO chat_settings (key, value) VALUES ('last_maintenance', ${String(now)}) ON CONFLICT DO NOTHING RETURNING key`;
  if (!claimed.length) return;
  for (const stmt of PURGE_SQL) await sql().unsafe(stmt);
}
