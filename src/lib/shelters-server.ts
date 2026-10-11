import { connection } from "next/server";
import { getShelters, type Shelter } from "./shelters";
import { SUGGEST_KIND_LABEL, type SuggestKind } from "./reports";
import { dbConfigured, ensureSchema, sql } from "./db";

type PubRow = { id: string; kind: Shelter["kind"]; address: string; lat: number; lng: number; note: string | null; source_url: string | null; day: string; object_type: string | null; placement: string | null; holder: string | null; capacity: number | null; origin: string };

// Статический список администрации + точки, добавленные модератором, минус скрытые.
export async function loadShelters(citySlug: string, opts: { includeHidden?: boolean } = {}): Promise<Shelter[]> {
  await connection(); // всегда динамически: иначе точки запекутся при сборке без БД
  const base = getShelters(citySlug);
  if (!dbConfigured()) return base;
  try {
    await ensureSchema();
    const [pub, hid] = await Promise.all([
      sql()<PubRow[]>`SELECT id::text, kind, address, lat, lng, note, source_url, object_type, placement, holder, capacity, origin, to_char(created_at, 'YYYY-MM-DD') AS day FROM published_shelters WHERE city_slug = ${citySlug} ORDER BY id`,
      sql()<{ shelter_id: string }[]>`SELECT shelter_id FROM shelter_overrides WHERE hidden`,
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
    const all = [...base, ...extra];
    if (opts.includeHidden) return all;
    const hidden = new Set(hid.map((h) => h.shelter_id));
    return all.filter((s) => !hidden.has(s.id));
  } catch (e) {
    console.error("loadShelters", e);
    return base;
  }
}
