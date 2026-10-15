import webpush from "web-push";
import { ensureSchema, sql } from "./db";
import { getSetting } from "./chat-db";
import { buildPayload, matchesRegion, type PostLite, type PushScope } from "./push-shared";

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

type Sub = { endpoint: string; p256dh: string; auth: string; scope: PushScope; region: string; url: string };

export async function saveSubscription(s: Sub): Promise<void> {
  await ensureSchema();
  await sql()`INSERT INTO push_subscriptions (endpoint, p256dh, auth, scope, region, url, fails, last_ok)
    VALUES (${s.endpoint}, ${s.p256dh}, ${s.auth}, ${s.scope}, ${s.region}, ${s.url}, 0, now())
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, scope = EXCLUDED.scope, region = EXCLUDED.region, url = EXCLUDED.url, fails = 0, last_ok = now()`;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await ensureSchema();
  await sql()`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

// Рассылка новых сообщений радара подписчикам: каждому не больше одного уведомления за обновление
export async function notifyRadar(posts: PostLite[]): Promise<{ sent: number; failed: number }> {
  if (!posts.length) return { sent: 0, failed: 0 };
  await ensureSchema();
  const subs = await sql()<Sub[]>`SELECT endpoint, p256dh, auth, scope, region, url FROM push_subscriptions WHERE fails < 5`;
  if (!subs.length) return { sent: 0, failed: 0 };
  const { publicKey: pub, privateKey: priv } = await vapid();
  const subject = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://") ? process.env.NEXT_PUBLIC_SITE_URL! : "https://www.oporamap.ru";
  webpush.setVapidDetails(subject, pub, priv);
  let sent = 0, failed = 0;
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(subs.slice(i, i + 25).map(async (s) => {
      const mine = s.scope === "all" ? posts : posts.filter((p) => matchesRegion(p, s.region));
      if (!mine.length) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(buildPayload(mine, s.scope, s.url)), { TTL: 900, urgency: "high", topic: "radar" });
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
