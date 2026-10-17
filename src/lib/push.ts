import webpush from "web-push";
import { ensureSchema, sql } from "./db";
import { getSetting } from "./chat-db";
import { buildPayload, matchesRegion, type PostLite, type PushScope } from "./push-shared";
import { afterRun, type RepeatKind, type Schedule } from "./push-campaign";

// Web Push для «Радара». Ключи VAPID создаются один раз и хранятся в базе: настраивать ничего не нужно.
async function vapid(): Promise<{ publicKey: string; privateKey: string }> {
  await ensureSchema();
  const pub = await getSetting("vapid_public", "");
  const priv = await getSetting("vapid_private", "");
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const k = webpush.generateVAPIDKeys();
  await sql()`INSERT INTO chat_settings (key, value) VALUES ('vapid_public', ${k.publicKey}) ON CONFLICT DO NOTHING`;
  await sql()`INSERT INTO chat_settings (key, value) VALUES ('vapid_private', ${k.privateKey}) ON CONFLICT DO NOTHING`;
  return { publicKey: await getSetting("vapid_public", k.publicKey), privateKey: await getSetting("vapid_private", k.privateKey) };
}

export const publicKey = async () => (await vapid()).publicKey;

type Sub = { endpoint: string; p256dh: string; auth: string; scope: PushScope; region: string; url: string; test?: boolean };

export async function saveSubscription(s: Sub): Promise<void> {
  await ensureSchema();
  const test = s.test === true;
  await sql()`INSERT INTO push_subscriptions (endpoint, p256dh, auth, scope, region, url, fails, last_ok, test)
    VALUES (${s.endpoint}, ${s.p256dh}, ${s.auth}, ${s.scope}, ${s.region}, ${s.url}, 0, now(), ${test})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, scope = EXCLUDED.scope, region = EXCLUDED.region, url = EXCLUDED.url, fails = 0, last_ok = now(), test = push_subscriptions.test OR EXCLUDED.test`;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await ensureSchema();
  await sql()`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

type Delivery = { sent: number; failed: number };

// Общая отправка: для каждого подписчика build возвращает содержимое уведомления или null (ничего не слать)
async function deliver(subs: Sub[], build: (s: Sub) => object | null, ttl = 900): Promise<Delivery> {
  if (!subs.length) return { sent: 0, failed: 0 };
  const { publicKey: pub, privateKey: priv } = await vapid();
  const subject = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://") ? process.env.NEXT_PUBLIC_SITE_URL! : "https://www.oporamap.ru";
  webpush.setVapidDetails(subject, pub, priv);
  let sent = 0, failed = 0;
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(subs.slice(i, i + 25).map(async (s) => {
      const payload = build(s);
      if (!payload) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: ttl, urgency: "high", topic: "radar" });
        sent++;
        await sql()`UPDATE push_subscriptions SET fails = 0, last_ok = now() WHERE endpoint = ${s.endpoint}`;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sql()`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`; // подписка отозвана или устройство больше недоступно
        else await sql()`UPDATE push_subscriptions SET fails = fails + 1 WHERE endpoint = ${s.endpoint}`;
      }
    }));
  }
  return { sent, failed };
}

// Рассылка новых сообщений радара подписчикам: каждому не больше одного уведомления за обновление
export async function notifyRadar(posts: PostLite[]): Promise<Delivery> {
  if (!posts.length) return { sent: 0, failed: 0 };
  await ensureSchema();
  const subs = await sql()<Sub[]>`SELECT endpoint, p256dh, auth, scope, region, url FROM push_subscriptions WHERE fails < 5`;
  return deliver(subs, (s) => {
    const mine = s.scope === "all" ? posts : posts.filter((p) => matchesRegion(p, s.region));
    return mine.length ? buildPayload(mine, s.scope, s.url) : null;
  });
}

// ───── рассылки из админки ─────
export type CampaignRow = {
  id: string; title: string; body: string; url: string; audience_region: string | null;
  repeat_kind: RepeatKind; every_minutes: number | null; time_of_day: string | null; weekdays: number[] | null;
  next_run_at: Date | null; end_at: Date | null; max_runs: number | null; runs: number; status: "active" | "paused" | "done";
};

const sched = (c: CampaignRow): Schedule => ({ repeat: c.repeat_kind, every_minutes: c.every_minutes, time_of_day: c.time_of_day, weekdays: c.weekdays });

// Отправка одной рассылки: всем подписчикам или выбравшим конкретный регион; test = только устройства, помеченные как тестовые
export async function sendCampaign(c: Pick<CampaignRow, "id" | "title" | "body" | "url" | "audience_region">, test = false): Promise<Delivery> {
  await ensureSchema();
  const subs = test
    ? await sql()<Sub[]>`SELECT endpoint, p256dh, auth, scope, region, url FROM push_subscriptions WHERE test`
    : await sql()<Sub[]>`SELECT endpoint, p256dh, auth, scope, region, url FROM push_subscriptions WHERE fails < 5 AND NOT test AND (${c.audience_region}::text IS NULL OR region = ${c.audience_region})`;
  const payload = { title: c.title, body: c.body, tag: `campaign-${c.id}`, renotify: true, url: c.url };
  return deliver(subs, () => payload, 3600);
}

// Запуск рассылок, время которых пришло. Вызывается при каждом обращении cron: один запуск выполняет только один из параллельных запросов.
export async function runDuePushes(): Promise<number> {
  await ensureSchema();
  const due = await sql()<CampaignRow[]>`SELECT id::text, title, body, url, audience_region, repeat_kind, every_minutes, time_of_day, weekdays, next_run_at, end_at, max_runs, runs, status
    FROM push_campaigns WHERE status = 'active' AND next_run_at <= now() ORDER BY next_run_at LIMIT 5`;
  let n = 0;
  for (const c of due) {
    const upd = afterRun(sched(c), new Date(), { end_at: c.end_at, max_runs: c.max_runs, runs: c.runs });
    // сравнение-и-замена: выигрывает один запрос, остальные пропускают эту рассылку
    const claimed = await sql()`UPDATE push_campaigns SET next_run_at = ${upd.next}, status = ${upd.status}, runs = runs + 1, last_run_at = now()
      WHERE id = ${c.id} AND status = 'active' AND next_run_at = ${c.next_run_at} RETURNING id`;
    if (!claimed.length) continue;
    const r = await sendCampaign(c).catch((e) => { console.error("campaign", c.id, e); return { sent: 0, failed: 0 }; });
    await sql()`UPDATE push_campaigns SET last_sent = ${r.sent}, last_failed = ${r.failed} WHERE id = ${c.id}`;
    n++;
  }
  return n;
}
