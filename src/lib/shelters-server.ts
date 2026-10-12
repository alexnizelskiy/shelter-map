import { connection } from "next/server";
import type { Shelter, Tri } from "./shelters";
import { getShelters } from "./shelters-data";
import { CITIES } from "./cities";
import { SUGGEST_KIND_LABEL, type SuggestKind } from "./reports";
import { dbConfigured, ensureSchema, sql } from "./db";

type PubRow = { id: string; kind: Shelter["kind"]; address: string; lat: number; lng: number; note: string | null; source_url: string | null; day: string; object_type: string | null; placement: string | null; holder: string | null; capacity: number | null; origin: string };

// Статический список администрации + точки, добавленные модератором, минус скрытые.
// citySlug = null: все города сразу (админка), запросы к базе при этом выполняются один раз.
async function load(citySlug: string | null, opts: { includeHidden?: boolean }): Promise<Shelter[]> {
  await connection(); // всегда динамически: иначе точки запекутся при сборке без БД
  const base = citySlug === null ? CITIES.flatMap((c) => getShelters(c.slug)) : getShelters(citySlug);
  if (!dbConfigured()) return base;
  try {
    await ensureSchema();
    const [pub, hid, acc] = await Promise.all([
      citySlug === null
        ? sql()<PubRow[]>`SELECT id::text, kind, address, lat, lng, note, source_url, object_type, placement, holder, capacity, origin, to_char(created_at, 'YYYY-MM-DD') AS day FROM published_shelters ORDER BY id`
        : sql()<PubRow[]>`SELECT id::text, kind, address, lat, lng, note, source_url, object_type, placement, holder, capacity, origin, to_char(created_at, 'YYYY-MM-DD') AS day FROM published_shelters WHERE city_slug = ${citySlug} ORDER BY id`,
      sql()<{ shelter_id: string }[]>`SELECT shelter_id FROM shelter_overrides WHERE hidden`,
      sql()<{ shelter_id: string; step_free: Tri | null; pets: Tri | null; hours: string | null }[]>`SELECT shelter_id, step_free, pets, hours FROM shelter_access`,
    ]);
    const extra: Shelter[] = pub.map((r) => ({
      id: `usr-${r.id}`,
      kind: r.kind,
      objectType: r.object_type || SUGGEST_KIND_LABEL[r.kind as SuggestKind] || "Укрытие",
      placement: r.placement ?? undefined,
      address: r.address,
      holder: r.holder ?? r.note ?? undefined,
      capacity: r.capacity ?? undefined,
      lat: r.lat,
      lng: r.lng,
      origin: r.origin === "official" ? "official" : "community",
      sourceUrl: r.source_url ?? undefined,
      sourceUpdatedAt: r.day,
      sourceCheckedAt: r.day,
    }));
    const byAccess = new Map(acc.map((a) => [a.shelter_id, { stepFree: a.step_free ?? undefined, pets: a.pets ?? undefined, hours: a.hours ?? undefined }]));
    const all = [...base, ...extra].map((s) => (byAccess.has(s.id) ? { ...s, access: byAccess.get(s.id) } : s));
    if (opts.includeHidden) return all;
    const hidden = new Set(hid.map((h) => h.shelter_id));
    return all.filter((s) => !hidden.has(s.id));
  } catch (e) {
    console.error("loadShelters", e);
    return base;
  }
}

export const loadShelters = (citySlug: string, opts: { includeHidden?: boolean } = {}) => load(citySlug, opts);
export const loadAllShelters = (opts: { includeHidden?: boolean } = {}) => load(null, opts);
