import { getCity } from "@/lib/cities";
import { loadShelters } from "@/lib/shelters-server";
import { REPORT_KINDS, REPORT_TTL_HOURS, WARN_WINDOW_HOURS, type ReportKind, type ReportSummary } from "@/lib/reports";
import { dbConfigured, ensureSchema, sql, SUMMARY_SQL, REPORT_LIMIT_SQL } from "@/lib/db";
import { ipHash, json, readJson, clean } from "@/lib/api-utils";

// Сводка сообщений жителей по городу. Без БД возвращаем пустой список, чтобы карта работала.
export async function GET(req: Request) {
  const city = getCity(new URL(req.url).searchParams.get("city") ?? "");
  if (!city) return json({ error: "Город не найден" }, 404);
  if (!dbConfigured()) return json({ reports: [], enabled: false });
  try {
    await ensureSchema();
    const ids = (await loadShelters(city.slug)).map((s) => s.id);
    const rows = (await sql().unsafe(SUMMARY_SQL, [REPORT_TTL_HOURS, WARN_WINDOW_HOURS, ids] as never)) as unknown as ReportSummary[];
    return json({ reports: rows, enabled: true }, 200, { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" });
  } catch (e) {
    console.error("reports GET", e);
    return json({ reports: [], enabled: false });
  }
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ error: "Некорректный запрос" }, 400);
  const shelterId = clean(body.shelterId, 32);
  const kind = clean(body.kind, 20) as ReportKind;
  if (!REPORT_KINDS.includes(kind)) return json({ error: "Неизвестный тип сообщения" }, 400);
  if (!dbConfigured()) return json({ error: "Приём сообщений ещё не подключён" }, 503);
  if (!(await loadShelters("rostov-na-donu")).some((s) => s.id === shelterId)) return json({ error: "Точка не найдена" }, 404);

  try {
    await ensureSchema();
    const h = ipHash(req);
    const [lim] = (await sql().unsafe(REPORT_LIMIT_SQL, [h, shelterId, kind] as never)) as unknown as { same: number; hour: number }[];
    if (lim.same > 0) return json({ error: "Вы уже отправляли такое сообщение по этой точке. Спасибо!" }, 429);
    if (lim.hour >= 20) return json({ error: "Слишком много сообщений. Попробуйте позже." }, 429);
    await sql().unsafe("INSERT INTO shelter_reports (shelter_id, kind, ip_hash) VALUES ($1,$2,$3)", [shelterId, kind, h] as never);
    return json({ ok: true });
  } catch (e) {
    console.error("reports POST", e);
    return json({ error: "Не удалось сохранить. Попробуйте позже." }, 500);
  }
}
