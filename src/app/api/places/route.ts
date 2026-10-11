import { json } from "@/lib/api-utils";
import { nearestPlace, searchPlaces } from "@/lib/places";
import { resolvePlaces } from "@/lib/places-resolve";

// ?q=ростов  — поиск по названию; ?near=47.2,39.7 — ближайший населённый пункт.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const near = sp.get("near");
  if (near) {
    const [lat, lng] = near.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "Некорректные координаты" }, 400);
    const p = await nearestPlace(lat, lng);
    return json({ results: p ? await resolvePlaces([p]) : [] });
  }
  const q = (sp.get("q") ?? "").slice(0, 60);
  const list = await searchPlaces(q, 15);
  return json({ results: await resolvePlaces(list) }, 200, { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" });
}
