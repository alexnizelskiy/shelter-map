// Каталог населённых пунктов России (GeoNames, CC BY 4.0). Подгружается лениво: ~160 тыс. записей.
import { bboxAround } from "./geo";

type Raw = { regions: string[]; places: [number, string, number, number, number, number, number][] };
export type Place = { id: number; name: string; region: string; lat: number; lng: number; pop: number; rank: number };

type Index = { raw: Raw; names: string[]; regions: string[] };
const g = globalThis as unknown as { __places?: Promise<Index> };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

function index(): Promise<Index> {
  g.__places ??= import("../../data/places-ru.json").then((m) => {
    const raw = (m.default ?? m) as unknown as Raw;
    return { raw, names: raw.places.map((p) => norm(p[1])), regions: raw.regions.map(norm) };
  });
  return g.__places;
}

const toPlace = (raw: Raw, p: Raw["places"][number]): Place => ({ id: p[0], name: p[1], region: raw.regions[p[2]], lat: p[3], lng: p[4], pop: p[5], rank: p[6] });

// Поиск по префиксу названия; «аксай рост» = Аксай в Ростовской области. Крупные места выше (массив отсортирован по населению).
export async function searchPlaces(q: string, limit = 12): Promise<Place[]> {
  const query = norm(q);
  if (query.length < 2) return [];
  const { raw, names, regions } = await index();
  const tokens = query.split(" ");
  const buckets: number[][] = [[], [], []];
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (n.startsWith(query)) { buckets[0].push(i); }
    else if (tokens.length > 1 && n.startsWith(tokens[0]) && tokens.slice(1).every((t) => regions[raw.places[i][2]].includes(t) || n.includes(t))) { buckets[1].push(i); }
    else if (n.includes(` ${query}`) || n.includes(`-${query}`)) { buckets[2].push(i); }
    if (buckets[0].length >= limit * 3) break;
  }
  return [...buckets[0], ...buckets[1], ...buckets[2]].slice(0, limit).map((i) => toPlace(raw, raw.places[i]));
}

export async function getPlace(id: number): Promise<Place | undefined> {
  const { raw } = await index();
  const p = raw.places.find((x) => x[0] === id);
  return p && toPlace(raw, p);
}

// Ближайший населённый пункт: среди найденных в радиусе 30 км берём самый населённый (так IP-геолокация даёт город, а не соседнюю деревню).
export async function nearestPlace(lat: number, lng: number, radiusKm = 30): Promise<Place | undefined> {
  const { raw } = await index();
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  let best: Raw["places"][number] | undefined;
  let bestScore = -Infinity;
  for (const p of raw.places) {
    if (Math.abs(p[3] - lat) > dLat || Math.abs(p[4] - lng) > dLng) continue;
    const d = Math.hypot((p[3] - lat) * 111, (p[4] - lng) * 111 * Math.cos((lat * Math.PI) / 180));
    if (d > radiusKm) continue;
    // 1 км расстояния ≈ x2 по населению: близкие крупные места выигрывают у далёких мелких
    const score = Math.log10(p[5] + 10) - d / 8;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best && toPlace(raw, best);
}

export const radiusByPop = (pop: number) => (pop > 1e6 ? 35 : pop > 250e3 ? 20 : pop > 100e3 ? 14 : pop > 30e3 ? 8 : pop > 5e3 ? 5 : 3);
export const zoomByPop = (pop: number) => (pop > 1e6 ? 10 : pop > 250e3 ? 11 : pop > 100e3 ? 12 : pop > 30e3 ? 13 : pop > 5e3 ? 13 : 14);

export const placeSlug = (id: number) => `p-${id}`;
export const isPlaceSlug = (slug: string) => /^p-\d+$/.test(slug);

// Оценочные границы по населению; точные уточняются запросом к Nominatim (см. cities-server).
export function estimateBox(p: Place) {
  return bboxAround(p.lat, p.lng, radiusByPop(p.pop));
}
