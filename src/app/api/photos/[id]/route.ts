import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

// Отдаём только одобренные фото; модератору (по сессии) — любые, чтобы он мог их проверить.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id) || !dbConfigured()) return new Response("Not found", { status: 404 });
  await ensureSchema();
  const [row] = await sql()<{ mime: string; data: Buffer | null; state: string }[]>`SELECT mime, data, state FROM shelter_photos WHERE id = ${id}`;
  if (!row?.data) return new Response("Not found", { status: 404 });
  const approved = row.state === "approved";
  if (!approved && !(await isAdmin())) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": approved ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
