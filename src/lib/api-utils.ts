import { createHash } from "node:crypto";
import { cleanEnv } from "./env";

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });

// В базе храним не IP, а соленый хэш: нужен только для защиты от накруток.
export function ipHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const salt = cleanEnv(process.env.IP_HASH_SECRET, "IP_HASH_SECRET") || "dev-only-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const t = await req.text();
    if (t.length > 4000) return null;
    const v = JSON.parse(t);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
