import { loadAnyCity } from "@/lib/cities-server";
import { loadShelters } from "@/lib/shelters-server";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { clean, ipHash, json, readJson } from "@/lib/api-utils";

// Предложение сведений о доступности от жителя: уходит модератору, на карте не меняется сразу
export async function POST(req: Request) {
  const b = await readJson(req);
  if (!b) return json({ error: "Некорректный запрос" }, 400);
  const citySlug = clean(b.city, 60);
  const shelterId = clean(b.shelterId, 32);
  const items: { field: "step_free" | "pets" | "hours"; value: string }[] = [];
  for (const [key, field] of [["stepFree", "step_free"], ["pets", "pets"]] as const) {
    const v = clean(b[key], 5);
    if (v === "yes" || v === "no") items.push({ field, value: v });
  }
  const hours = clean(b.hours, 80);
  if (hours) items.push({ field: "hours", value: hours });
  if (!citySlug || !shelterId || !items.length) return json({ error: "Укажите хотя бы одно сведение" }, 400);
  if (!dbConfigured()) return json({ error: "Приём сведений ещё не подключён" }, 503);
  try {
    if (!(await loadAnyCity(citySlug))) return json({ error: "Город не найден" }, 404);
    if (!(await loadShelters(citySlug)).some((s) => s.id === shelterId)) return json({ error: "Точка не найдена" }, 404);
    await ensureSchema();
    const h = ipHash(req);
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM access_suggestions WHERE ip_hash = ${h} AND created_at > now() - interval '24 hours'`;
    if (n >= 9) return json({ error: "Достигнут суточный лимит." }, 429);
    for (const it of items) {
      await sql()`INSERT INTO access_suggestions (city_slug, shelter_id, field, value, ip_hash) VALUES (${citySlug}, ${shelterId}, ${it.field}, ${it.value}, ${h})`;
    }
    return json({ ok: true });
  } catch (e) {
    console.error("access POST", e);
    return json({ error: "Не удалось сохранить.", code: (e as { code?: string }).code ?? "unknown" }, 500);
  }
}
