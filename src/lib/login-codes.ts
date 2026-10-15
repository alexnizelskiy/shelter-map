import { randomInt } from "node:crypto";
import { ensureSchema, sql } from "./db";

// Вход в чат через бота (MAX): на сайте создаётся одноразовый код, человек открывает бота по ссылке (или отправляет ему код),
// бот подтверждает код от имени человека, а сайт забирает результат и выдаёт сессию. Код живёт 10 минут и привязан к браузеру (кука).
export const CODE_LEN = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов 0/O и 1/I
export const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
export const LOGIN_COOKIE = "max_login";
export const LOGIN_TTL_MIN = 10;

export const newCode = () => Array.from({ length: CODE_LEN }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// Текст сообщения боту → код входа: «/start login_КОД», «login_КОД», «вход КОД», «login КОД»
export function parseLoginText(text: string): string | null {
  const m = /^(?:\/start\s+)?(?:login_|вход\s+|login\s+)([A-Za-z0-9]{10})$/i.exec(text.trim());
  const code = m?.[1].toUpperCase();
  return code && CODE_RE.test(code) ? code : null;
}

export const CONFIRM_SQL = `UPDATE login_codes SET ext_id = $2, first_name = $3, last_name = $4, avatar_url = $5, status = 'ok'
  WHERE code = $1 AND provider = $6 AND status = 'pending' AND created_at > now() - interval '${LOGIN_TTL_MIN} minutes' RETURNING code`;
export const CLAIM_SQL = `DELETE FROM login_codes WHERE code = $1 AND status = 'ok' AND created_at > now() - interval '${LOGIN_TTL_MIN} minutes'
  RETURNING provider, ext_id, first_name, last_name, avatar_url`;
export const STATUS_SQL = `SELECT status, (created_at > now() - interval '${LOGIN_TTL_MIN} minutes') AS fresh FROM login_codes WHERE code = $1`;
export const RATE_SQL = `SELECT count(*)::int AS n FROM login_codes WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`;

export async function createLoginCode(provider: string, ipHash: string): Promise<string | null> {
  await ensureSchema();
  const [{ n }] = (await sql().unsafe(RATE_SQL, [ipHash])) as unknown as { n: number }[];
  if (n >= 20) return null; // не больше 20 кодов в час с одного адреса
  const code = newCode();
  await sql()`INSERT INTO login_codes (code, provider, ip_hash) VALUES (${code}, ${provider}, ${ipHash})`;
  return code;
}

export type LoginWho = { extId: string; firstName: string; lastName: string; avatar: string | null };

// Бот подтверждает код: true — подтверждён, false — код неизвестен, просрочен или уже использован
export async function confirmLoginCode(code: string, provider: string, who: LoginWho): Promise<boolean> {
  if (!CODE_RE.test(code)) return false;
  await ensureSchema();
  const rows = await sql().unsafe(CONFIRM_SQL, [code, who.extId, who.firstName.slice(0, 60), who.lastName.slice(0, 60), who.avatar?.slice(0, 500) ?? null, provider]);
  return rows.length > 0;
}

export type Claim = { provider: string; extId: string; firstName: string; lastName: string; avatar: string | null };
export type PollResult = { state: "ok"; who: Claim } | { state: "pending" } | { state: "expired" };

// Сайт спрашивает результат; успешный код удаляется (одноразовый)
export async function claimLoginCode(code: string): Promise<PollResult> {
  if (!CODE_RE.test(code)) return { state: "expired" };
  await ensureSchema();
  const [st] = (await sql().unsafe(STATUS_SQL, [code])) as unknown as { status: string; fresh: boolean }[];
  if (!st || !st.fresh) return { state: "expired" };
  if (st.status !== "ok") return { state: "pending" };
  const [r] = (await sql().unsafe(CLAIM_SQL, [code])) as unknown as { provider: string; ext_id: string; first_name: string; last_name: string; avatar_url: string | null }[];
  if (!r) return { state: "expired" };
  return { state: "ok", who: { provider: r.provider, extId: r.ext_id, firstName: r.first_name ?? "", lastName: r.last_name ?? "", avatar: r.avatar_url } };
}
