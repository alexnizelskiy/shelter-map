import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cleanEnv } from "./env";

// ───── сессия чата: подписанная кука «id.срок.подпись» ─────
export const SESSION_COOKIE = "chat_session";
const SESSION_DAYS = 30;
const secret = () => cleanEnv(process.env.CHAT_SECRET) || cleanEnv(process.env.IP_HASH_SECRET) || cleanEnv(process.env.ADMIN_PASSWORD) || "dev-chat-secret";
const sign = (v: string) => createHmac("sha256", secret()).update(`chat|${v}`).digest("hex");

const safeEq = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export function makeSessionToken(userId: number) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const body = `${userId}.${exp}`;
  return { value: `${body}.${sign(body)}`, maxAge: SESSION_DAYS * 86400 };
}

export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const [id, exp, mac] = token.split(".");
  if (!id || !exp || !mac || !safeEq(mac, sign(`${id}.${exp}`))) return null;
  if (!(Number(exp) > Date.now())) return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ───── какие способы входа настроены ─────
export const providerConfig = () => ({
  telegram: Boolean(cleanEnv(process.env.TELEGRAM_BOT_TOKEN) && cleanEnv(process.env.NEXT_PUBLIC_TELEGRAM_BOT)),
  vk: Boolean(cleanEnv(process.env.VK_CLIENT_ID)),
  yandex: Boolean(cleanEnv(process.env.YANDEX_CLIENT_ID) && cleanEnv(process.env.YANDEX_CLIENT_SECRET)),
  max: Boolean(cleanEnv(process.env.MAX_BOT_TOKEN)),
  dev: cleanEnv(process.env.CHAT_DEV_LOGIN) === "1",
});

// ───── проверка подписи Telegram / MAX ─────
export type Identity = { provider: string; extId: string; firstName: string; lastName: string; avatar: string | null };

const hmacHex = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest("hex");
const fresh = (authDate: number, maxAgeSec = 86400) => Number.isFinite(authDate) && Date.now() / 1000 - authDate < maxAgeSec && authDate - Date.now() / 1000 < 300;

// Telegram Login Widget: ключ = SHA256(токен бота)
export function verifyTelegramWidget(data: Record<string, string | number | undefined>, botToken: string): Identity | null {
  const { hash, ...rest } = data;
  if (!hash || !botToken) return null;
  const check = Object.keys(rest).filter((k) => rest[k] !== undefined && rest[k] !== null).sort().map((k) => `${k}=${rest[k]}`).join("\n");
  const key = createHash("sha256").update(botToken).digest();
  if (!safeEq(hmacHex(key, check), String(hash))) return null;
  if (!fresh(Number(rest.auth_date))) return null;
  return { provider: "telegram", extId: String(rest.id), firstName: String(rest.first_name ?? ""), lastName: String(rest.last_name ?? ""), avatar: rest.photo_url ? String(rest.photo_url) : null };
}

// initData мини-приложения (Telegram и MAX одинаково): ключ = HMAC_SHA256("WebAppData", токен бота)
export function verifyWebAppData(initData: string, botToken: string, provider: "telegram" | "max"): Identity | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(botToken).digest();
  if (!safeEq(hmacHex(key, check), hash)) return null;
  if (!fresh(Number(params.get("auth_date")))) return null;
  try {
    const u = JSON.parse(params.get("user") ?? "{}");
    if (u.id == null) return null;
    return { provider, extId: String(u.id), firstName: String(u.first_name ?? ""), lastName: String(u.last_name ?? ""), avatar: u.photo_url ? String(u.photo_url) : null };
  } catch { return null; }
}

// ───── PKCE и случайные строки для OAuth ─────
const b64url = (b: Buffer) => b.toString("base64url");
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));
export const pkceChallenge = (verifier: string) => b64url(createHash("sha256").update(verifier).digest());

// Адрес сайта для redirect_uri: NEXT_PUBLIC_SITE_URL или хост запроса
export function siteOrigin(req: Request): string {
  const env = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL);
  if (env) return env.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Куда вернуть пользователя после входа: только путь на нашем сайте
export const safeReturn = (v: string | null | undefined) => (v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : "/");

// ───── отображаемое имя: фамилию скрываем, оставляем первую букву и точку ─────
export const cleanFirstName = (v: string) => v.replace(/[\u0000-\u001f<>]/g, "").trim().split(/\s+/)[0]?.slice(0, 24) || "Гость";
export const lastInitial = (v: string) => (/^[A-Za-zА-Яа-яЁё]/.test(v.trim()) ? v.trim()[0].toUpperCase() : "");
export const displayName = (first: string, initial: string) => (initial ? `${first} ${initial}.` : first);
