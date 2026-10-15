import { clean, json, readJson } from "@/lib/api-utils";
import { dbConfigured } from "@/lib/db";
import { saveSubscription } from "@/lib/push";
import { allowedEndpoint, safePath } from "@/lib/push-shared";

// Подписка устройства на уведомления «Радара»: scope = «region» (свой регион) или «all» (вся Россия)
export async function POST(req: Request) {
  if (!dbConfigured()) return json({ error: "База не подключена" }, 503);
  const b = await readJson(req);
  const sub = (b?.subscription ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const p256dh = typeof sub.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub.keys?.auth === "string" ? sub.keys.auth : "";
  if (!allowedEndpoint(sub.endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) return json({ error: "Некорректная подписка" }, 400);
  const region = clean(b?.region, 60);
  const scope = b?.scope === "all" || !region ? "all" : "region";
  await saveSubscription({ endpoint: sub.endpoint, p256dh, auth, scope, region: scope === "all" ? "" : region, url: safePath(b?.url) });
  return json({ ok: true });
}
