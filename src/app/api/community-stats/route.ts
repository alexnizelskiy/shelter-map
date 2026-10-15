import { connection } from "next/server";
import { json } from "@/lib/api-utils";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";

// Общие числа сообщества для раздела «Ваша помощь»: только счётчики, без данных о людях
export async function GET() {
  await connection(); // всегда динамически: иначе ответ запёкся бы при сборке
  if (!dbConfigured()) return json({ reports24h: 0, reports7d: 0, places30d: 0 });
  try {
    await ensureSchema();
    const [r] = await sql()<{ reports24h: number; reports7d: number; places30d: number }[]>`
      SELECT (SELECT count(*) FROM shelter_reports WHERE created_at > now() - interval '24 hours')::int AS reports24h,
             (SELECT count(*) FROM shelter_reports WHERE created_at > now() - interval '7 days')::int AS reports7d,
             (SELECT count(*) FROM published_shelters WHERE created_at > now() - interval '30 days')::int AS places30d`;
    return json(r, 200, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" });
  } catch (e) {
    console.error("community-stats", e);
    return json({ reports24h: 0, reports7d: 0, places30d: 0 });
  }
}
