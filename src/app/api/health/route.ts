import { connection } from "next/server";
import { json } from "@/lib/api-utils";
import { cleanEnv } from "@/lib/env";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";

// Диагностика без секретов: что настроено и доходит ли сервер до базы. Показываем только код ошибки, без адресов.
export async function GET() {
  await connection(); // всегда динамически: состояние окружения нельзя запекать при сборке
  const flags = {
    adminPassword: cleanEnv(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD").length >= 8,
    ipHashSecret: cleanEnv(process.env.IP_HASH_SECRET, "IP_HASH_SECRET").length > 0,
    tilesKey: cleanEnv(process.env.NEXT_PUBLIC_TILES_URL, "NEXT_PUBLIC_TILES_URL").length > 0,
  };
  if (!dbConfigured()) return json({ db: "not_configured", hint: "Задайте DATABASE_URL в переменных окружения Vercel и сделайте Redeploy.", ...flags });
  try {
    const t = Date.now();
    await ensureSchema();
    await sql()`SELECT 1`;
    return json({ db: "ok", ms: Date.now() - t, ...flags });
  } catch (e) {
    const code = (e as { code?: string; name?: string }).code ?? (e as Error).name ?? "unknown";
    const hints: Record<string, string> = {
      ECONNREFUSED: "База недоступна по адресу из DATABASE_URL. Проверьте хост/порт и разрешённые IP (у Vercel IP динамические — нужен доступ из любых адресов).",
      ETIMEDOUT: "Таймаут подключения. Скорее всего база не принимает соединения с адресов Vercel — откройте доступ из интернета или используйте пулер.",
      ENOTFOUND: "Не найден хост из DATABASE_URL. Проверьте адрес.",
      CONNECT_TIMEOUT: "Таймаут подключения. Проверьте доступ из интернета к базе.",
      "28P01": "Неверный пароль или пользователь. Если в пароле есть спецсимволы (@ # / ?), закодируйте их в ссылке (%40 %23 %2F %3F).",
      "3D000": "Базы с таким именем нет.",
      DEPTH_ZERO_SELF_SIGNED_CERT: "Проблема с SSL-сертификатом базы. Попробуйте DATABASE_SSL=disable только если провайдер разрешает соединение без SSL.",
    };
    return json({ db: "error", code, hint: hints[code] ?? "См. логи функции в Vercel (Deployments → Functions).", ...flags }, 200);
  }
}
