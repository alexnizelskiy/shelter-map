"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, checkPassword, isAdmin, makeToken } from "@/lib/admin-auth";
import { ensureSchema, sql } from "@/lib/db";
import { CLEAR_OPTIONS, setSetting } from "@/lib/chat-db";
import { siteOrigin } from "@/lib/chat-auth";
import { tg, webhookSecret } from "@/lib/telegram";
import { clean } from "@/lib/api-utils";
import { clientIpFromHeaders } from "@/lib/proxy-trust";
import { createHash } from "node:crypto";
import { CITIES } from "@/lib/cities";
import { bboxAround, parseCoords, slugify } from "@/lib/geo";

const MAX_FAILS = 8;

async function guard() {
  if (!(await isAdmin())) redirect("/admin");
  await ensureSchema();
}

export async function login(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  await ensureSchema();
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const ipH = createHash("sha256").update(`admin:${ip}`).digest("hex").slice(0, 32);
  const [{ n }] = await sql()<{ n: number }[]>`SELECT count(*)::int AS n FROM admin_attempts WHERE ip_hash = ${ipH} AND created_at > now() - interval '15 minutes'`;
  if (n >= MAX_FAILS) return { error: "Слишком много попыток. Подождите 15 минут." };
  if (!checkPassword(String(form.get("password") ?? ""))) {
    await sql()`INSERT INTO admin_attempts (ip_hash) VALUES (${ipH})`;
    await new Promise((r) => setTimeout(r, 800));
    return { error: "Неверный пароль" };
  }
  const t = makeToken();
  (await cookies()).set(COOKIE, t.value, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: t.maxAge });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/admin");
}

export async function setSuggestionState(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  const state = String(form.get("state"));
  if (!["rejected", "need_info", "new"].includes(state)) return;
  const note = clean(form.get("note"), 300) || null;
  await sql()`UPDATE suggestions SET state = ${state}, moderator_note = ${note}, reviewed_at = now() WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function approveSuggestion(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  const kind = String(form.get("kind"));
  if (!["other_shelter", "help_point", "unknown"].includes(kind)) return; // «официальным» заявку сделать нельзя
  const address = clean(form.get("address"), 200);
  const note = clean(form.get("note"), 300) || null;
  if (address.length < 5) return;
  const [s] = await sql()<{ city_slug: string; lat: number; lng: number; source_url: string | null; state: string }[]>`SELECT city_slug, lat, lng, source_url, state FROM suggestions WHERE id = ${id}`;
  if (!s || s.state === "approved") return;
  await sql().begin(async (tx) => {
    await tx`INSERT INTO published_shelters (city_slug, kind, address, lat, lng, note, source_url, suggestion_id) VALUES (${s.city_slug}, ${kind}, ${address}, ${s.lat}, ${s.lng}, ${note}, ${s.source_url}, ${id})`;
    await tx`UPDATE suggestions SET state = 'approved', moderator_note = ${note}, reviewed_at = now() WHERE id = ${id}`;
  });
  revalidatePath("/admin");
}

export async function setHidden(form: FormData) {
  await guard();
  const shelterId = clean(form.get("shelterId"), 32);
  const hidden = form.get("hidden") === "1";
  if (!shelterId) return;
  await sql()`INSERT INTO shelter_overrides (shelter_id, hidden, updated_at) VALUES (${shelterId}, ${hidden}, now())
    ON CONFLICT (shelter_id) DO UPDATE SET hidden = EXCLUDED.hidden, updated_at = now()`;
  revalidatePath("/admin");
}

export async function clearReports(form: FormData) {
  await guard();
  const shelterId = clean(form.get("shelterId"), 32);
  if (!shelterId) return;
  await sql()`DELETE FROM shelter_reports WHERE shelter_id = ${shelterId}`;
  revalidatePath("/admin");
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function addCity(form: FormData) {
  await guard();
  const name = clean(form.get("name"), 80);
  const slug = slugify(clean(form.get("slug"), 60) || name);
  const c = parseCoords(String(form.get("coords") ?? ""));
  const zoom = Math.min(16, Math.max(5, Math.round(num(form.get("zoom"))) || 11));
  const radius = Math.min(300, Math.max(3, num(form.get("radius")) || 30));
  if (!name || !slug || !c || CITIES.some((x) => x.slug === slug)) return;
  const [minLng, minLat, maxLng, maxLat] = bboxAround(c.lat, c.lng, radius);
  await sql()`INSERT INTO cities (slug, name, center_lng, center_lat, zoom, min_lng, min_lat, max_lng, max_lat)
    VALUES (${slug}, ${name}, ${c.lng}, ${c.lat}, ${zoom}, ${minLng}, ${minLat}, ${maxLng}, ${maxLat})
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, center_lng = EXCLUDED.center_lng, center_lat = EXCLUDED.center_lat,
      zoom = EXCLUDED.zoom, min_lng = EXCLUDED.min_lng, min_lat = EXCLUDED.min_lat, max_lng = EXCLUDED.max_lng, max_lat = EXCLUDED.max_lat`;
  revalidatePath("/admin");
}

export async function setCityActive(form: FormData) {
  await guard();
  const slug = clean(form.get("slug"), 60);
  await sql()`UPDATE cities SET is_active = ${form.get("active") === "1"} WHERE slug = ${slug}`;
  revalidatePath("/admin");
}

export async function addShelter(form: FormData) {
  await guard();
  const city = clean(form.get("city"), 60);
  const kind = String(form.get("kind"));
  const address = clean(form.get("address"), 200);
  const c = parseCoords(String(form.get("coords") ?? ""));
  const sourceUrl = clean(form.get("sourceUrl"), 300);
  const capacity = Math.round(num(form.get("capacity")));
  if (!["official_shelter", "other_shelter", "help_point", "unknown"].includes(kind) || address.length < 3 || !c || !city) return;
  if (kind === "official_shelter" && !/^https?:\/\//i.test(sourceUrl)) return; // «официальное» только со ссылкой на источник
  const known = CITIES.some((x) => x.slug === city) || (await sql()`SELECT 1 FROM cities WHERE slug = ${city}`).length > 0;
  if (!known) return;
  await sql()`INSERT INTO published_shelters (city_slug, kind, address, lat, lng, note, source_url, object_type, placement, holder, capacity, origin)
    VALUES (${city}, ${kind}, ${address}, ${c.lat}, ${c.lng}, ${null}, ${/^https?:\/\//i.test(sourceUrl) ? sourceUrl : null},
      ${clean(form.get("objectType"), 80) || null}, ${clean(form.get("placement"), 60) || null}, ${clean(form.get("holder"), 200) || null},
      ${Number.isFinite(capacity) && capacity > 0 ? capacity : null}, ${/^https?:\/\//i.test(sourceUrl) ? "official" : "community"})`;
  revalidatePath("/admin");
}

export async function deleteShelter(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  if (Number.isFinite(id)) await sql()`DELETE FROM published_shelters WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function approvePhoto(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  if (Number.isFinite(id)) await sql()`UPDATE shelter_photos SET state = 'approved', reviewed_at = now() WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function rejectPhoto(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  // отклонённое фото не храним: освобождаем место
  if (Number.isFinite(id)) await sql()`UPDATE shelter_photos SET state = 'rejected', data = NULL, reviewed_at = now() WHERE id = ${id}`;
  revalidatePath("/admin");
}

// ───── бот Telegram ─────
export async function setupTelegramBot() {
  await guard();
  const origin = siteOrigin(new Request("http://x", { headers: await headers() }));
  let result = "ok";
  try {
    if (!webhookSecret()) throw new Error("не задан TELEGRAM_WEBHOOK_SECRET");
    await tg("setWebhook", { url: `${origin}/api/bot/telegram`, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"] });
    await tg("setMyCommands", { commands: [
      { command: "start", description: "Открыть карту" },
      { command: "alarm", description: "Режим «Тревога»" },
      { command: "help", description: "Помощь" },
    ] });
    await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Опора", web_app: { url: `${origin}/tg` } } });
    await tg("setMyShortDescription", { short_description: "Опора — карта укрытий: ближайшее укрытие, маршрут и чат жителей." });
    await tg("setMyDescription", { description: "Опора — карта укрытий. Показывает ближайшее укрытие, строит маршрут, работает без сети в режиме «Тревога». Информация справочная: следуйте оповещениям МЧС." });
  } catch (e) {
    result = `err ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
  }
  redirect(`/admin?tab=bot&result=${encodeURIComponent(result)}`);
}

export async function removeTelegramWebhook() {
  await guard();
  let result = "ok";
  try { await tg("deleteWebhook", { drop_pending_updates: false }); } catch (e) { result = `err ${e instanceof Error ? e.message : String(e)}`.slice(0, 200); }
  redirect(`/admin?tab=bot&result=${encodeURIComponent(result)}`);
}

// ───── доступность ─────
const triOrNull = (v: FormDataEntryValue | null) => (v === "yes" || v === "no" ? v : null);

export async function approveAccessSuggestion(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  const [s] = await sql()<{ shelter_id: string; field: string; value: string; state: string }[]>`SELECT shelter_id, field, value, state FROM access_suggestions WHERE id = ${id}`;
  if (!s || s.state !== "new") return;
  if (s.field === "step_free") await sql()`INSERT INTO shelter_access (shelter_id, step_free) VALUES (${s.shelter_id}, ${s.value}) ON CONFLICT (shelter_id) DO UPDATE SET step_free = EXCLUDED.step_free, updated_at = now()`;
  else if (s.field === "pets") await sql()`INSERT INTO shelter_access (shelter_id, pets) VALUES (${s.shelter_id}, ${s.value}) ON CONFLICT (shelter_id) DO UPDATE SET pets = EXCLUDED.pets, updated_at = now()`;
  else if (s.field === "hours") await sql()`INSERT INTO shelter_access (shelter_id, hours) VALUES (${s.shelter_id}, ${s.value}) ON CONFLICT (shelter_id) DO UPDATE SET hours = EXCLUDED.hours, updated_at = now()`;
  await sql()`UPDATE access_suggestions SET state = 'approved' WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function rejectAccessSuggestion(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  if (Number.isFinite(id)) await sql()`UPDATE access_suggestions SET state = 'rejected' WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function setAccessManual(form: FormData) {
  await guard();
  const shelterId = clean(form.get("shelterId"), 32);
  if (!shelterId) return;
  const stepFree = triOrNull(form.get("stepFree"));
  const pets = triOrNull(form.get("pets"));
  const hours = clean(form.get("hours"), 80) || null;
  if (!stepFree && !pets && !hours) await sql()`DELETE FROM shelter_access WHERE shelter_id = ${shelterId}`;
  else await sql()`INSERT INTO shelter_access (shelter_id, step_free, pets, hours) VALUES (${shelterId}, ${stepFree}, ${pets}, ${hours})
    ON CONFLICT (shelter_id) DO UPDATE SET step_free = EXCLUDED.step_free, pets = EXCLUDED.pets, hours = EXCLUDED.hours, updated_at = now()`;
  revalidatePath("/admin");
}

export async function closeDataRequest(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  if (Number.isFinite(id)) await sql()`UPDATE data_requests SET state = 'done', closed_at = now() WHERE id = ${id}`;
  revalidatePath("/admin");
}

// ───── чат ─────
export async function saveChatSettings(form: FormData) {
  await guard();
  const hours = Number(form.get("clear_hours"));
  if (CLEAR_OPTIONS.some((o) => o.hours === hours)) {
    await setSetting("clear_hours", String(hours));
    await setSetting("last_clear_at", String(Date.now())); // новое расписание отсчитывается с этого момента
  }
  await setSetting("enabled", form.get("enabled") === "1" ? "1" : "0");
  revalidatePath("/admin");
}

export async function clearChatNow() {
  await guard();
  await sql()`DELETE FROM chat_messages`;
  await setSetting("last_clear_at", String(Date.now()));
  revalidatePath("/admin");
}

export async function deleteChatMessage(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  if (Number.isFinite(id)) await sql()`UPDATE chat_messages SET deleted = true WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function banChatUser(form: FormData) {
  await guard();
  const id = Number(form.get("userId"));
  const hours = Number(form.get("hours"));
  if (!Number.isFinite(id)) return;
  // hours = 0 — навсегда (100 лет)
  const until = new Date(Date.now() + (hours > 0 ? hours * 3600_000 : 100 * 365 * 86400_000));
  await sql()`UPDATE chat_users SET banned_until = ${until} WHERE id = ${id}`;
  await sql()`UPDATE chat_messages SET deleted = true WHERE user_id = ${id} AND created_at > now() - interval '1 day'`;
  revalidatePath("/admin");
}

export async function unbanChatUser(form: FormData) {
  await guard();
  const id = Number(form.get("userId"));
  if (Number.isFinite(id)) await sql()`UPDATE chat_users SET banned_until = NULL WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function dismissChatReports(form: FormData) {
  await guard();
  const id = Number(form.get("id"));
  if (Number.isFinite(id)) await sql()`DELETE FROM chat_reports WHERE message_id = ${id}`;
  revalidatePath("/admin");
}
