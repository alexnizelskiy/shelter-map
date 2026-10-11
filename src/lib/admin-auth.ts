import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cleanEnv } from "./env";

export const COOKIE = "admin_session";
const TTL_MS = 12 * 3600 * 1000;

const password = () => cleanEnv(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD");
export const adminEnabled = () => password().length >= 8;

const sign = (exp: number) =>
  createHmac("sha256", `${password()}|${cleanEnv(process.env.IP_HASH_SECRET, "IP_HASH_SECRET")}`).update(`admin|${exp}`).digest("hex");

export const makeToken = () => {
  const exp = Date.now() + TTL_MS;
  return { value: `${exp}.${sign(exp)}`, maxAge: TTL_MS / 1000 };
};

const eq = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export const checkPassword = (input: string) => adminEnabled() && eq(input, password());

export async function isAdmin(): Promise<boolean> {
  if (!adminEnabled()) return false;
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [expStr, mac] = v.split(".");
  const exp = Number(expStr);
  return Number.isFinite(exp) && exp > Date.now() && !!mac && eq(mac, sign(exp));
}
