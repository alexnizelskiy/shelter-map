import { after, connection } from "next/server";
import { clean, json } from "@/lib/api-utils";
import { dbConfigured } from "@/lib/db";
import { listRadar, radarEnabled, radarStatus, refreshRadar } from "@/lib/radar";

// Лента «Радар» за последние сутки. ?region=Ростовская область — только этот регион; без параметра — вся Россия.
export async function GET(req: Request) {
  await connection(); // всегда динамически: иначе ответ запёкся бы при сборке
  if (!dbConfigured()) return json({ enabled: false, posts: [] });
  try {
    if (!(await radarEnabled())) return json({ enabled: false, posts: [] });
    // Обновление не чаще раза в минуту. Если лента уже есть, отдаём её сразу, а свежее подтягиваем после ответа: страница не ждёт Telegram.
    // Первое заполнение (пустая лента) выполняется до ответа.
    const before = await radarStatus();
    const refresh = () => refreshRadar().catch((e) => console.error("radar refresh", e));
    if (before.count > 0) after(refresh); else await refresh();
    const region = clean(new URL(req.url).searchParams.get("region"), 60);
    const [posts, st] = await Promise.all([listRadar(region), radarStatus()]);
    return json({ enabled: true, posts, updatedAt: st.okAt || null, stale: Boolean(st.error) }, 200, { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" });
  } catch (e) {
    console.error("radar", e);
    return json({ enabled: true, posts: [], error: true }, 200);
  }
}
