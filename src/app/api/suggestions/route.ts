import { getCity } from "@/lib/cities";
import { SUGGEST_BASIS, SUGGEST_KINDS, type SuggestBasis, type SuggestKind } from "@/lib/reports";
import { dbConfigured, ensureSchema, sql, SUGGEST_LIMIT_SQL } from "@/lib/db";
import { ipHash, json, readJson, clean } from "@/lib/api-utils";

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!b) return json({ error: "Некорректный запрос" }, 400);
  if (clean(b.website, 50)) return json({ ok: true }); // ловушка для ботов: тихо «принимаем»

  const city = getCity(clean(b.city, 40));
  if (!city) return json({ error: "Город не найден" }, 404);
  const kind = clean(b.kind, 30) as SuggestKind;
  const basis = clean(b.basis, 30) as SuggestBasis;
  const address = clean(b.address, 200);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const comment = clean(b.comment, 300);
  const sourceUrl = clean(b.sourceUrl, 300);

  if (!SUGGEST_KINDS.includes(kind) || !SUGGEST_BASIS.includes(basis)) return json({ error: "Проверьте тип и основание" }, 400);
  if (address.length < 5) return json({ error: "Укажите адрес или описание места" }, 400);
  const [minLng, minLat, maxLng, maxLat] = city.bbox;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lng < minLng || lng > maxLng || lat < minLat || lat > maxLat)
    return json({ error: "Отметьте точку на карте в пределах города" }, 400);
  if (b.consent !== true) return json({ error: "Нужно согласие с правилами" }, 400);
  if (sourceUrl && !/^https?:\/\/[^\s]+$/i.test(sourceUrl)) return json({ error: "Ссылка должна начинаться с http:// или https://" }, 400);
  if (!dbConfigured()) return json({ error: "Приём заявок ещё не подключён" }, 503);

  try {
    await ensureSchema();
    const h = ipHash(req);
    const [lim] = (await sql().unsafe(SUGGEST_LIMIT_SQL, [h] as never)) as unknown as { n: number }[];
    if (lim.n >= 5) return json({ error: "Достигнут суточный лимит заявок." }, 429);
    await sql().unsafe(
      "INSERT INTO suggestions (city_slug, kind, address, lat, lng, basis, source_url, comment, ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [city.slug, kind, address, lat, lng, basis, sourceUrl || null, comment || null, h] as never,
    );
    return json({ ok: true });
  } catch (e) {
    console.error("suggestions POST", e);
    return json({ error: "Не удалось сохранить. Попробуйте позже." }, 500);
  }
}
