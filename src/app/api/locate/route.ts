import { json } from "@/lib/api-utils";
import { clientGeoFromHeaders } from "@/lib/proxy-trust";
import { nearestPlace } from "@/lib/places";
import { resolvePlaces } from "@/lib/places-resolve";

// Примерное местоположение по IP (заголовки Vercel). Это город-уровень, точное определение запрашивается у браузера отдельно.
export async function GET(req: Request) {
  const geo = clientGeoFromHeaders(req.headers);
  if (!geo) return json({ found: false });
  if (geo.country && geo.country !== "RU") return json({ found: false, country: geo.country });
  const p = await nearestPlace(geo.lat, geo.lng);
  if (!p) return json({ found: false });
  const [r] = await resolvePlaces([p]);
  return json({ found: true, source: "ip", place: r }, 200, { "Cache-Control": "private, no-store" });
}
