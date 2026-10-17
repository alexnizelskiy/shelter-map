// Расписание push-рассылок из админки: чистые функции без базы и сети (их проверяют автотесты).
// Время в админке и в расписании — московское (UTC+3, без перехода на летнее время).
export type RepeatKind = "none" | "interval" | "daily" | "weekly";
export type Schedule = { repeat: RepeatKind; every_minutes: number | null; time_of_day: string | null; weekdays: number[] | null };

export const MSK_MIN = 180;
const MIN = 60_000, DAY = 86_400_000;

// «2026-10-17T09:30» (московское время из поля datetime-local) → момент времени
export function parseMsk(v: unknown): Date | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim()) : null;
  if (!m) return null;
  const [y, mo, da, h, mi] = m.slice(1).map(Number);
  const local = new Date(Date.UTC(y, mo - 1, da, h, mi));
  // строгая проверка: 31 ноября или 25:61 не превращаются молча в другую дату
  if (local.getUTCFullYear() !== y || local.getUTCMonth() !== mo - 1 || local.getUTCDate() !== da || local.getUTCHours() !== h || local.getUTCMinutes() !== mi) return null;
  return new Date(local.getTime() - MSK_MIN * MIN);
}

export const parseTime = (v: unknown): string | null => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : null);

// Московские сутки и день недели (1 = понедельник … 7 = воскресенье) для момента времени
const mskParts = (d: Date) => {
  const t = new Date(d.getTime() + MSK_MIN * MIN);
  return { dayStart: Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - MSK_MIN * MIN, weekday: t.getUTCDay() === 0 ? 7 : t.getUTCDay() };
};

// Ближайшее срабатывание строго после `after`; null — расписание не повторяется
export function nextAfter(s: Schedule, after: Date): Date | null {
  if (s.repeat === "none") return null;
  if (s.repeat === "interval") return s.every_minutes && s.every_minutes > 0 ? new Date(after.getTime() + s.every_minutes * MIN) : null;
  const t = parseTime(s.time_of_day);
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  const days = s.repeat === "weekly" ? new Set(s.weekdays ?? []) : null;
  if (days && !days.size) return null;
  const { dayStart } = mskParts(after);
  for (let i = 0; i < 9; i++) {
    const day = dayStart + i * DAY;
    const at = new Date(day + (hh * 60 + mm) * MIN);
    if (at.getTime() <= after.getTime()) continue;
    if (days && !days.has(mskParts(new Date(day + 12 * 3600_000)).weekday)) continue;
    return at;
  }
  return null;
}

// Первый запуск новой рассылки. start — когда начинать (пусто = сразу)
export function firstRun(s: Schedule, start: Date | null, now: Date): Date | null {
  if (s.repeat === "none" || s.repeat === "interval") return start && start.getTime() > now.getTime() ? start : now;
  return nextAfter(s, start && start.getTime() > now.getTime() ? new Date(start.getTime() - 1) : now);
}

// Что делать после запуска: следующее время и статус (учитываются дата окончания и число запусков)
export function afterRun(s: Schedule, ranAt: Date, opts: { end_at: Date | null; max_runs: number | null; runs: number }): { next: Date | null; status: "active" | "done" } {
  const runsNow = opts.runs + 1;
  if (opts.max_runs !== null && runsNow >= opts.max_runs) return { next: null, status: "done" };
  const next = nextAfter(s, ranAt);
  if (!next || (opts.end_at && next.getTime() > opts.end_at.getTime())) return { next: null, status: "done" };
  return { next, status: "active" };
}

const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export function describe(s: Schedule): string {
  if (s.repeat === "none") return "один раз";
  if (s.repeat === "interval") { const m = s.every_minutes ?? 0; return m % 1440 === 0 ? `каждые ${m / 1440} дн.` : m % 60 === 0 ? `каждые ${m / 60} ч` : `каждые ${m} мин`; }
  if (s.repeat === "daily") return `каждый день в ${s.time_of_day} (МСК)`;
  return `${(s.weekdays ?? []).slice().sort().map((d) => WD[d - 1]).join(", ")} в ${s.time_of_day} (МСК)`;
}
