import { json, readJson } from "@/lib/api-utils";
import { dbConfigured } from "@/lib/db";
import { removeSubscription } from "@/lib/push";
import { allowedEndpoint } from "@/lib/push-shared";

export async function POST(req: Request) {
  if (!dbConfigured()) return json({ error: "База не подключена" }, 503);
  const b = await readJson(req);
  if (!allowedEndpoint(b?.endpoint)) return json({ error: "Некорректный адрес" }, 400);
  await removeSubscription(b!.endpoint as string);
  return json({ ok: true });
}
