import { connection } from "next/server";
import { getShelters, type Shelter } from "./shelters";
import { SUGGEST_KIND_LABEL, type SuggestKind } from "./reports";
import { dbConfigured, ensureSchema, sql } from "./db";

type PubRow = { id: string; kind: Shelter["kind"]; address: string; lat: number; lng: number; note: string | null; source_url: string | null; day: string };

// Статический список администрации + точки, добавленные модератором, минус скрытые.
export async function loadShelters(citySlug: string, opts: { includeHidden?: boolean } = {}): Promise<Shelter[]> {
  const base = getShelters(citySlug);
  if (!dbConfigured()) return base;
  await connection();
  try {
    await ensureSchema();
    const [pub, hid] = await Promise.all([
      sql()<PubRow[]>`SELECT id::text, kind, address, lat, lng, note, source_url, to_char(created_at, 'YYYY-MM-DD') AS day FROM published_shelters WHERE city_slug = ${citySlug} ORDER BY id`,
      sql()<{ shelter_id: string }[]>`SELECT shelter_id FROM shelter_overrides WHERE hidden`,
    ]);
    const extra: Shelter[] = pub.map((r) => ({
      id: `usr-${r.id}`,
      kind: r.kind,
      objectType: SUGGEST_KIND_LABEL[r.kind as SuggestKind] ?? "Укрытие",
      address: r.address,
      holder: r.note ?? undefined,
      lat: r.lat,
      lng: r.lng,
      origin: "community",
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
