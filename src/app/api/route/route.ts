import { json } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { stepText } from "@/lib/route-text";

// Открытый OSRM (FOSSGIS) годится для пилота; для нагрузки задайте свой сервер в ROUTING_BASE_FOOT / ROUTING_BASE_CAR.
const BASE = {
  foot: cleanEnv(process.env.ROUTING_BASE_FOOT) || "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
  car: cleanEnv(process.env.ROUTING_BASE_CAR) || "https://routing.openstreetmap.de/routed-car/route/v1/driving",
};
const MAX_KM = { foot: 40, car: 300 };

const pt = (v: string | null) => {
  const [lng, lat] = (v ?? "").split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) && lat > 30 && lat < 85 && lng > 15 && lng < 190 ? { lng, lat } : null;
};
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  return 12742 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2));
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = pt(q.get("from"));
  const to = pt(q.get("to"));
  const mode = q.get("mode") === "car" ? "car" : "foot";
  if (!from || !to) return json({ error: "Некорректные координаты" }, 400);
  if (km(from, to) > MAX_KM[mode]) return json({ error: mode === "foot" ? "Слишком далеко для пешего маршрута" : "Слишком далеко" }, 422);

  try {
    const url = `${BASE[mode]}/${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const r = await fetch(url, { headers: { "User-Agent": "shelter-map/0.1 (+routing proxy)" }, signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    if (!r.ok || d.code !== "Ok" || !d.routes?.length) return json({ error: "Маршрут не найден" }, 404);
    type RawStep = { maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] }; name?: string; distance: number; duration: number };
    const routes = (d.routes as { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: RawStep[] }[] }[]).slice(0, 3).map((route) => ({
      distance: Math.round(route.distance),
      duration: Math.round(route.duration),
      coords: route.geometry.coordinates,
      steps: route.legs[0].steps
        .filter((st, i, a) => st.distance > 0 || i === a.length - 1 || i === 0)
        .slice(0, 150)
        .map((st) => ({
          text: stepText(st),
          distance: Math.round(st.distance),
          duration: Math.round(st.duration),
          type: st.maneuver.type,
          modifier: st.maneuver.modifier ?? null,
          name: st.name ?? "",
          loc: st.maneuver.location,
        })),
    }));
    return json({ mode, routes }, 200, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" });
  } catch (e) {
    console.error("route", e);
    return json({ error: "Сервис маршрутов недоступен. Откройте маршрут в Яндекс.Картах." }, 502);
  }
}
