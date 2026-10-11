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

// ───── виртуальные города из каталога населённых пунктов (/p-<id>) ─────
import { cacheLife } from "next/cache";
import { getPlace, estimateBox, isPlaceSlug, zoomByPop, type Place } from "./places";

// Границы населённого пункта из OSM (Nominatim); кэшируются на сутки. При ошибке бросаем исключение, чтобы промах не закэшировался.
async function osmBox(id: number, name: string, region: string, lat: number, lng: number): Promise<[number, number, number, number] | null> {
  "use cache";
  cacheLife("days");
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ru&accept-language=ru&q=${encodeURIComponent(`${name}, ${region}`)}`;
  const r = await fetch(url, { headers: { "User-Agent": "shelter-map/0.1 (city bounds lookup)" }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const rows = (await r.json()) as { lat: string; lon: string; boundingbox: [string, string, string, string]; category?: string; class?: string }[];
  const close = rows
    .map((x) => ({ x, d: Math.hypot((Number(x.lat) - lat) * 111, (Number(x.lon) - lng) * 111 * Math.cos((lat * Math.PI) / 180)) }))
    .filter((c) => c.d < 25)
    .sort((a, b) => a.d - b.d)[0];
  if (!close) return null;
  const [s, n, w, e] = close.x.boundingbox.map(Number);
  return [w, s, e, n];
}

export async function placeToCity(p: Place): Promise<City> {
  let fit = estimateBox(p);
  try {
    const exact = await osmBox(p.id, p.name, p.region, p.lat, p.lng);
    // правдоподобные границы: не меньше 1 км и не больше 120 км
    if (exact && exact[2] - exact[0] > 0.01 && exact[2] - exact[0] < 2.5) fit = exact;
  } catch (e) {
    console.error("osmBox", e);
  }
  const padLng = (fit[2] - fit[0]) * 0.15;
  const padLat = (fit[3] - fit[1]) * 0.15;
  return {
    slug: `p-${p.id}`, name: p.name, center: [p.lng, p.lat], zoom: zoomByPop(p.pop),
    bbox: [fit[0] - padLng, fit[1] - padLat, fit[2] + padLng, fit[3] + padLat], fit, place: { id: p.id, region: p.region },
  };
}

export async function loadAnyCity(slug: string): Promise<City | undefined> {
  const known = await loadCity(slug);
  if (known) return known;
  if (!isPlaceSlug(slug)) return undefined;
  const p = await getPlace(Number(slug.slice(2)));
  return p ? placeToCity(p) : undefined;
}
