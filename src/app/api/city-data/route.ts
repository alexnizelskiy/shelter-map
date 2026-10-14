import { json } from "@/lib/api-utils";
import { loadCity } from "@/lib/cities-server";
import { loadShelters } from "@/lib/shelters-server";

// Город с полным списком его объектов: подгружается, когда карту переместили в область другого города
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const city = await loadCity(slug);
  if (!city) return json({ error: "Город не найден" }, 404);
  return json({ city, shelters: await loadShelters(slug) }, 200, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" });
}
