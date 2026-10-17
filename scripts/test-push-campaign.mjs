// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-push-campaign.mjs
import { afterRun, describe, firstRun, nextAfter, parseMsk, parseTime } from "../src/lib/push-campaign.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };
const iso = (d) => d && d.toISOString();
const utc = (s) => new Date(s);

t("московское время из формы → UTC", iso(parseMsk("2026-10-17T09:30")) === "2026-10-17T06:30:00.000Z" && iso(parseMsk("2026-10-17T01:00")) === "2026-10-16T22:00:00.000Z");
t("кривые даты и время отклоняются", parseMsk("вчера") === null && parseMsk("2026-13-45T99:99") === null && parseMsk("2026-11-31T10:00") === null && parseMsk("2026-02-29T10:00") === null && parseMsk("2028-02-29T10:00") !== null && parseMsk(5) === null && parseTime("24:00") === null && parseTime("9:30") === null && parseTime("09:30") === "09:30");

const daily = { repeat: "daily", every_minutes: null, time_of_day: "09:00", weekdays: null };
t("каждый день в 09:00 МСК: сегодня, если время ещё не прошло", iso(nextAfter(daily, utc("2026-10-17T05:00:00Z"))) === "2026-10-17T06:00:00.000Z");
t("…завтра, если уже прошло", iso(nextAfter(daily, utc("2026-10-17T07:00:00Z"))) === "2026-10-18T06:00:00.000Z");
t("…строго после текущего момента (ровно 09:00 → завтра)", iso(nextAfter(daily, utc("2026-10-17T06:00:00Z"))) === "2026-10-18T06:00:00.000Z");
t("полночь по Москве: день считается по МСК, а не по UTC", iso(nextAfter({ ...daily, time_of_day: "00:30" }, utc("2026-10-16T22:00:00Z"))) === "2026-10-17T21:30:00.000Z");

// 2026-10-17 — суббота; по понедельникам и средам в 10:00
const weekly = { repeat: "weekly", every_minutes: null, time_of_day: "10:00", weekdays: [1, 3] };
t("по дням недели: из субботы → понедельник 10:00 МСК", iso(nextAfter(weekly, utc("2026-10-17T12:00:00Z"))) === "2026-10-19T07:00:00.000Z");
t("…из понедельника после 10:00 → среда", iso(nextAfter(weekly, utc("2026-10-19T08:00:00Z"))) === "2026-10-21T07:00:00.000Z");
t("…без дней недели расписания нет", nextAfter({ ...weekly, weekdays: [] }, utc("2026-10-17T12:00:00Z")) === null);
const every = { repeat: "interval", every_minutes: 180, time_of_day: null, weekdays: null };
t("каждые 3 часа", iso(nextAfter(every, utc("2026-10-17T10:00:00Z"))) === "2026-10-17T13:00:00.000Z");
t("одноразовая рассылка не повторяется", nextAfter({ repeat: "none", every_minutes: null, time_of_day: null, weekdays: null }, new Date()) === null);

const now = utc("2026-10-17T07:00:00Z");
t("первый запуск: «сразу» — сейчас; «в указанное время» — это время", iso(firstRun({ repeat: "none", every_minutes: null, time_of_day: null, weekdays: null }, null, now)) === iso(now) && iso(firstRun({ repeat: "none", every_minutes: null, time_of_day: null, weekdays: null }, utc("2026-10-18T10:00:00Z"), now)) === "2026-10-18T10:00:00.000Z");
t("первый запуск ежедневной: ближайшее время, с отложенным стартом — после него", iso(firstRun(daily, null, now)) === "2026-10-18T06:00:00.000Z" && iso(firstRun(daily, utc("2026-10-20T00:00:00Z"), now)) === "2026-10-20T06:00:00.000Z");

const lim = { end_at: null, max_runs: null, runs: 0 };
t("после запуска: повторяющаяся продолжается", afterRun(daily, now, lim).status === "active" && iso(afterRun(daily, now, lim).next) === "2026-10-18T06:00:00.000Z");
t("после запуска: одноразовая завершается", afterRun({ repeat: "none", every_minutes: null, time_of_day: null, weekdays: null }, now, lim).status === "done");
t("лимит запусков: последний запуск завершает рассылку", afterRun(every, now, { ...lim, max_runs: 3, runs: 2 }).status === "done" && afterRun(every, now, { ...lim, max_runs: 3, runs: 1 }).status === "active");
t("дата окончания: следующий запуск позже неё — рассылка завершена", afterRun(every, now, { ...lim, end_at: utc("2026-10-17T08:00:00Z") }).status === "done" && afterRun(every, now, { ...lim, end_at: utc("2026-10-17T12:00:00Z") }).status === "active");
t("описания расписаний", describe(daily) === "каждый день в 09:00 (МСК)" && describe(weekly) === "пн, ср в 10:00 (МСК)" && describe(every) === "каждые 3 ч" && describe({ ...every, every_minutes: 2880 }) === "каждые 2 дн." && describe({ ...every, every_minutes: 45 }) === "каждые 45 мин");
if (bad) process.exitCode = 1;
