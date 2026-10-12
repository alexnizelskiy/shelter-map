import { headers } from "next/headers";
import { json, readJson } from "@/lib/api-utils";
import { dbConfigured } from "@/lib/db";
import { isBotUa, recordHit } from "@/lib/analytics";

// Счётчик посещений без cookie (см. src/lib/analytics.ts). Ответ всегда быстрый и пустой: сбой счётчика никому не виден.
export async function POST(req: Request) {
  const body = await readJson(req);
  const path = typeof body?.path === "string" ? body.path.slice(0, 200) : "";
  const h = await headers();
  if (!path.startsWith("/") || path.startsWith("/admin") || path.startsWith("/api") || isBotUa(h.get("user-agent")) || !dbConfigured()) return new Response(null, { status: 204 });
  try {
    await recordHit(h, { path, source: typeof body?.src === "string" ? body.src : "", ref: typeof body?.ref === "string" ? body.ref : "", channel: typeof body?.ch === "string" ? body.ch : "web" });
  } catch (e) { console.error("hit", e); }
  return new Response(null, { status: 204 });
}
