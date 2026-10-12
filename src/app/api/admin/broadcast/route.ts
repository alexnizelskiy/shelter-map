import { isAdmin } from "@/lib/admin-auth";
import { json, readJson } from "@/lib/api-utils";
import { ensureSchema, sql } from "@/lib/db";
import { progress, runBatch } from "@/lib/broadcast";

// Очередная партия рассылки. Страница рассылок вызывает этот адрес по кругу, пока есть неотправленные. Только для администратора.
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "forbidden" }, 403);
  const body = await readJson(req);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "bad id" }, 400);
  await ensureSchema();
  if (body?.cancel === true) {
    await sql()`UPDATE broadcasts SET status = 'cancelled', finished_at = now() WHERE id = ${id} AND status = 'sending'`;
    return json({ progress: await progress(id), retry: false });
  }
  return json(await runBatch(id));
}
