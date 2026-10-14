import { json } from "@/lib/api-utils";
import { loadMapPoints } from "@/lib/shelters-server";

// Точки всех городов для фонового слоя карты (id, координаты, вид, город). Кэшируется на сервере и на устройстве.
export async function GET() {
  return json(await loadMapPoints(), 200, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" });
}
