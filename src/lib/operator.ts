import { cleanEnv } from "./env";

export { LEGAL_VERSION, LEGAL_DATE_RU } from "./legal-meta";

// Реквизиты оператора персональных данных берутся из переменных окружения
export function operator() {
  const g = (k: string) => cleanEnv(process.env[k]);
  const o = { name: g("OPERATOR_NAME"), inn: g("OPERATOR_INN"), email: g("OPERATOR_EMAIL"), address: g("OPERATOR_ADDRESS"), site: g("NEXT_PUBLIC_SITE_URL") };
  const missing = (["OPERATOR_NAME", "OPERATOR_INN", "OPERATOR_EMAIL", "OPERATOR_ADDRESS"] as const).filter((k) => !g(k));
  return { ...o, missing };
}

// Хранение данных: сроки, которые реально выполняет очистка (src/lib/maintenance.ts) и которые указаны в политике
export const RETENTION = {
  reportsDays: 90,
  suggestionsRejectedDays: 180,
  ipHashDays: 90,
  chatProfileInactiveMonths: 12,
  dataRequestDoneMonths: 12,
  adminAttemptsDays: 7,
};
