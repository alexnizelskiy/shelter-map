import { json } from "@/lib/api-utils";
import { nearestPlace } from "@/lib/places";
import { resolvePlaces } from "@/lib/places-resolve";

// Примерное местоположение по IP (заголовки Vercel). Это город-уровень, точное определение запрашивается у браузера отдельно.
export async function GET(req: Request) {
  const lat = Number(req.headers.get("x-vercel-ip-latitude"));
  const lng = Number(req.headers.get("x-vercel-ip-longitude"));
  const country = req.headers.get("x-vercel-ip-country");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return json({ found: false });
  if (country && country !== "RU") return json({ found: false, country });
  const p = await nearestPlace(lat, lng);
  if (!p) return json({ found: false });
  const [r] = await resolvePlaces([p]);
  return json({ found: true, source: "ip", place: r }, 200, { "Cache-Control": "private, no-store" });
}
