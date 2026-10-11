import { loadAnyCity } from "@/lib/cities-server";
import { loadShelters } from "@/lib/shelters-server";
import { toCompact } from "@/lib/shelters-compact";
import { json } from "@/lib/api-utils";

// Компактный список точек города: используется режимом «Тревога» и кэшируется на устройстве для работы без сети
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("city") ?? "";
  const city = await loadAnyCity(slug);
  if (!city) return json({ error: "Город не найден" }, 404);
  const shelters = (await loadShelters(slug)).map(toCompact);
  return json({ city: { slug: city.slug, name: city.name, center: city.center }, shelters, at: Date.now() }, 200, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" });
}
