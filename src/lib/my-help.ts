import { readPref, writePref } from "./use-pref";

// Личный счётчик помощи хранится только на этом устройстве: отметки анонимны, привязать их к человеку на сервере мы не можем (и не хотим).
export const HELP_KEY = "my-help";
export type HelpKind = "reports" | "suggestions" | "photos" | "access";
export type MyHelp = { reports: number; suggestions: number; photos: number; access: number; since: string | null };

const EMPTY: MyHelp = { reports: 0, suggestions: 0, photos: 0, access: 0, since: null };
const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.floor(Number(v)), 1_000_000) : 0);

export function parseHelp(raw: string): MyHelp {
  try {
    const j = JSON.parse(raw) as Partial<MyHelp>;
    return { reports: num(j.reports), suggestions: num(j.suggestions), photos: num(j.photos), access: num(j.access), since: typeof j.since === "string" ? j.since.slice(0, 10) : null };
  } catch { return EMPTY; }
}

export const helpTotal = (h: MyHelp) => h.reports + h.suggestions + h.photos + h.access;

export function bumpHelp(kind: HelpKind) {
  const h = parseHelp(readPref(HELP_KEY, ""));
  writePref(HELP_KEY, JSON.stringify({ ...h, [kind]: h[kind] + 1, since: h.since ?? new Date().toISOString().slice(0, 10) }));
}
