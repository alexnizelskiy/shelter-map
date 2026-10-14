// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-map-city.mjs
// Автовыбор города при перемещении карты: на настоящих данных (Ростов + города из ГИС РО).
import { readFileSync } from "node:fs";
import { cityAt } from "../src/lib/map-city.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

const rostov = JSON.parse(readFileSync("data/rostov-na-donu.json", "utf8"));
const gisro = JSON.parse(readFileSync("data/gisro-shelters.json", "utf8"));
const lists = { "rostov-na-donu": rostov, ...gisro };
const slugs = Object.keys(lists);
const p = [];
slugs.forEach((s, ci) => lists[s].forEach((x) => p.push([x.id, x.lat, x.lng, 0, ci])));
const pts = { slugs, k: ["other_shelter"], p };
t("данные загружены", p.length > 4000, String(p.length));

const center = (slug) => { const l = lists[slug]; return [l.reduce((a, x) => a + x.lng, 0) / l.length, l.reduce((a, x) => a + x.lat, 0) / l.length]; };
const at = (slug, cur) => { const [lng, lat] = center(slug); return cityAt(pts, lng, lat, cur); };

t("из Ростова переехали в Таганрог → Таганрог", at("taganrog", "rostov-na-donu") === "taganrog");
t("из Таганрога вернулись в Ростов → Ростов", cityAt(pts, 39.72, 47.22, "taganrog") === "rostov-na-donu");
t("Батайск рядом с Ростовом выбирается, когда карта над Батайском", cityAt(pts, 39.735, 47.14, "rostov-na-donu") === "bataysk");
t("Азов", cityAt(pts, 39.42, 47.11, "rostov-na-donu") === "azov");
t("центр в своём городе: ничего не меняется", cityAt(pts, 39.72, 47.22, "rostov-na-donu") === null && at("taganrog", "taganrog") === null);
t("глушь далеко от любых точек: остаёмся", cityAt(pts, 44.0, 49.9, "rostov-na-donu") === null && cityAt(pts, 36, 45, "azov") === null);

// устойчивость на границе: смещение карты на 1 км не должно переключать туда и обратно
const [bx, by] = [39.7335, 47.1385]; // Батайск
let flips = 0, cur = "rostov-na-donu";
for (let i = 0; i <= 40; i++) { const lat = 47.19 - i * 0.002; const next = cityAt(pts, bx, lat, cur); if (next) { flips++; cur = next; } }
t("плавный путь Ростов → Батайск: не более двух переключений", flips <= 2, `переключений: ${flips}, итог ${cur}`);
if (bad) process.exitCode = 1;
