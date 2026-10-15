// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-my-help.mjs
import { helpTotal, parseHelp } from "../src/lib/my-help.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

t("пусто и мусор не ломают разбор", helpTotal(parseHelp("")) === 0 && helpTotal(parseHelp("не json")) === 0 && helpTotal(parseHelp("null")) === 0 && helpTotal(parseHelp("[]")) === 0);
const h = parseHelp(JSON.stringify({ reports: 3, suggestions: 1, photos: 0, access: 2, since: "2026-10-14T10:00:00Z" }));
t("счётчики и дата читаются", h.reports === 3 && h.suggestions === 1 && h.access === 2 && h.since === "2026-10-14" && helpTotal(h) === 6);
const bad1 = parseHelp(JSON.stringify({ reports: -5, suggestions: "abc", photos: 1e12, access: 2.9, since: 5 }));
t("отрицательные, нечисловые и огромные значения отсекаются", bad1.reports === 0 && bad1.suggestions === 0 && bad1.photos === 1_000_000 && bad1.access === 2 && bad1.since === null, JSON.stringify(bad1));
if (bad) process.exitCode = 1;
