import { loadAnyCity } from "@/lib/cities-server";
import { loadShelters } from "@/lib/shelters-server";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { clean, ipHash, json } from "@/lib/api-utils";

const MAX_BYTES = 900_000;

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

// Список одобренных фото точки: [{ id }]
export async function GET(req: Request) {
  const shelter = clean(new URL(req.url).searchParams.get("shelter"), 32);
  if (!shelter || !dbConfigured()) return json({ photos: [] });
  try {
    await ensureSchema();
    const rows = await sql()<{ id: string }[]>`SELECT id::text FROM shelter_photos WHERE shelter_id = ${shelter} AND state = 'approved' ORDER BY id LIMIT 12`;
    return json({ photos: rows }, 200, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" });
  } catch (e) {
    console.error("photos GET", e);
    return json({ photos: [] });
  }
}

export async function POST(req: Request) {
  if (!dbConfigured()) return json({ error: "Приём фото ещё не подключён" }, 503);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Некорректный запрос" }, 400); }
  const file = form.get("file");
  const shelterId = clean(form.get("shelterId"), 32);
  const citySlug = clean(form.get("city"), 60);
  if (!(file instanceof File) || !shelterId || !citySlug) return json({ error: "Не хватает данных" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Фото слишком большое" }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return json({ error: "Поддерживаются JPEG, PNG и WebP" }, 400);
  if (form.get("consent") !== "1") return json({ error: "Нужно подтвердить правила съёмки" }, 400);

  try {
    if (!(await loadAnyCity(citySlug))) return json({ error: "Город не найден" }, 404);
    if (!(await loadShelters(citySlug)).some((s) => s.id === shelterId)) return json({ error: "Точка не найдена" }, 404);
    await ensureSchema();
    const h = ipHash(req);
    const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM shelter_photos WHERE ip_hash = ${h} AND created_at > now() - interval '24 hours'`;
    if (n >= 3) return json({ error: "Достигнут суточный лимит фото." }, 429);
    await sql()`INSERT INTO shelter_photos (city_slug, shelter_id, mime, size, data, ip_hash) VALUES (${citySlug}, ${shelterId}, ${mime}, ${bytes.byteLength}, ${Buffer.from(bytes)}, ${h})`;
    return json({ ok: true });
  } catch (e) {
    console.error("photos POST", e);
    return json({ error: "Не удалось сохранить фото.", code: (e as { code?: string }).code ?? "unknown" }, 500);
  }
}
