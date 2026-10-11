import { loadCities } from "./cities-server";
import { placeSlug, type Place } from "./places";

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();
const km = (aLat: number, aLng: number, bLat: number, bLng: number) =>
  Math.hypot((aLat - bLat) * 111, (aLng - bLng) * 111 * Math.cos((aLat * Math.PI) / 180));

export type PlaceResult = Place & { slug: string; hasData: boolean };

// Если для найденного места уже есть город сервиса (с данными), ведём в него; иначе на страницу места /p-<id>.
export async function resolvePlaces(list: Place[]): Promise<PlaceResult[]> {
  const cities = await loadCities();
  return list.map((p) => {
    const c = cities.find((x) => norm(x.name) === norm(p.name) && km(p.lat, p.lng, x.center[1], x.center[0]) < 25);
    return { ...p, slug: c ? c.slug : placeSlug(p.id), hasData: Boolean(c) };
  });
}
