import { clean, ipHash, json, readJson } from "@/lib/api-utils";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { REQUEST_KINDS } from "@/lib/legal-meta";

// Запросы по персональным данным и объектам: попадают в админку на вкладку «Запросы»
export async function POST(req: Request) {
  const b = await readJson(req);
  if (!b) return json({ error: "Некорректный запрос" }, 400);
  if (clean(b.website, 20)) return json({ ok: true }); // ловушка для ботов
  const kind = clean(b.kind, 30);
  const contact = clean(b.contact, 120);
  const details = clean(b.details, 1000);
  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) return json({ error: "Выберите тип запроса" }, 400);
  if (contact.length < 5) return json({ error: "Укажите, как с вами связаться (почта, телефон или ник)" }, 400);
  if (b.consent !== true) return json({ error: "Нужно согласие на обработку контактов" }, 400);
  if (!dbConfigured()) return json({ error: "Приём запросов ещё не подключён. Напишите на почту оператора." }, 503);
  try {
    await ensureSchema();
    const h = ipHash(req);
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM data_requests WHERE ip_hash = ${h} AND created_at > now() - interval '24 hours'`;
    if (n >= 3) return json({ error: "Достигнут суточный лимит запросов." }, 429);
    await sql()`INSERT INTO data_requests (kind, contact, details, ip_hash) VALUES (${kind}, ${contact}, ${details || null}, ${h})`;
    return json({ ok: true });
  } catch (e) {
    console.error("data-request", e);
    return json({ error: "Не удалось сохранить запрос.", code: (e as { code?: string }).code ?? "unknown" }, 500);
  }
}
