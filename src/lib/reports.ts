export const REPORT_KINDS = ["open", "closed", "not_found", "wrong_info"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_LABEL: Record<ReportKind, string> = {
  open: "Вход открыт",
  closed: "Вход закрыт",
  not_found: "Не удалось найти вход",
  wrong_info: "Адрес или описание неверны",
};

// Сообщения жителей актуальны ограниченное время, потом статус возвращается в «не подтверждено».
export const REPORT_TTL_HOURS = 24;
// Сколько независимых сообщений о проблеме за 6 часов включают предупреждение на карте.
export const WARN_THRESHOLD = 2;
export const WARN_WINDOW_HOURS = 6;

export type ReportSummary = {
  shelterId: string;
  open: number;
  closed: number;
  not_found: number;
  wrong_info: number;
  problems6h: number;
  lastKind: ReportKind;
  lastAt: string; // ISO
};

export const SUGGEST_BASIS = ["official_link", "own_observation", "from_other", "unknown"] as const;
export type SuggestBasis = (typeof SUGGEST_BASIS)[number];
export const BASIS_LABEL: Record<SuggestBasis, string> = {
  official_link: "Есть ссылка на официальный источник",
  own_observation: "Личное наблюдение",
  from_other: "Информация от другого человека",
  unknown: "Не знаю",
};

export const SUGGEST_KINDS = ["official_shelter", "other_shelter", "help_point", "unknown"] as const;
export type SuggestKind = (typeof SUGGEST_KINDS)[number];
export const SUGGEST_KIND_LABEL: Record<SuggestKind, string> = {
  official_shelter: "Предположительно официальное убежище",
  other_shelter: "Другое укрытие",
  help_point: "Пункт помощи",
  unknown: "Не знаю точного типа",
};

export const flaggedIds = (s: ReportSummary[]) => s.filter((x) => x.problems6h >= WARN_THRESHOLD).map((x) => x.shelterId);
