import { connection } from "next/server";
import { CITIES, type City } from "./cities";
import { dbConfigured, ensureSchema, sql } from "./db";

type Row = { slug: string; name: string; center_lng: number; center_lat: number; zoom: number; min_lng: number; min_lat: number; max_lng: number; max_lat: number; is_active: boolean };

const toCity = (r: Row): City => ({
  slug: r.slug, name: r.name, center: [r.center_lng, r.center_lat], zoom: r.zoom, bbox: [r.min_lng, r.min_lat, r.max_lng, r.max_lat],
});

// Статические города + города из админки. При ошибке БД остаются статические.
export async function loadCities(opts: { includeInactive?: boolean } = {}): Promise<(City & { dynamic?: boolean; active?: boolean })[]> {
  await connection(); // всегда динамически: иначе список города запечётся при сборке без БД
  const base = CITIES.map((c) => ({ ...c, active: true }));
  if (!dbConfigured()) return base;
  try {
    await ensureSchema();
    const rows = await sql()<Row[]>`SELECT * FROM cities ORDER BY name`;
    const extra = rows.filter((r) => opts.includeInactive || r.is_active).map((r) => ({ ...toCity(r), dynamic: true, active: r.is_active }));
    return [...base, ...extra.filter((e) => !base.some((b) => b.slug === e.slug))];
  } catch (e) {
    console.error("loadCities", e);
    return base;
  }
}

export async function loadCity(slug: string): Promise<City | undefined> {
  return (await loadCities()).find((c) => c.slug === slug);
}
