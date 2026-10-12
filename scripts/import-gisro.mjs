// Укрытия из ГИС Ростовской области (gisro.donland.ru, слой «Карта укрытий», таблица shelter_s) → все населённые пункты области.
// Запуск: node scripts/import-gisro.mjs         (скачивает данные)
//         OFFLINE=1 node scripts/import-gisro.mjs   (берёт сохранённый data/raw/gisro-shelter_s.json)
// Результат: data/gisro-cities.json (населённые пункты и границы карты) и data/gisro-shelters.json (укрытия по слагам).
// Ростов-на-Дону не трогаем: он собран из карты администрации города (data/rostov-na-donu.json, там больше полей).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { TYPE_LABEL, cityBox, cleanText, isPerson, km, median, parseLocation, placeKey, slugify } from "./gisro-lib.mjs";

const API = "https://gisro.donland.ru/api/geojson/shelter_s/";
const RAW = "data/raw/gisro-shelter_s.json";
const SOURCE_URL = "https://gisro.donland.ru/#/map/?layersName=shelter_s_open";
const SKIP = new Set(["rostov-na-donu"]);
const today = new Date().toISOString().slice(0, 10);

let features;
if (process.env.OFFLINE && existsSync(RAW)) features = JSON.parse(readFileSync(RAW, "utf8")).features;
else {
  const r = await fetch(API, { signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(`ГИС РО: ${r.status}`);
  features = (await r.json()).features;
  writeFileSync(RAW, JSON.stringify({ fetchedAt: today, features }));
}

// 1) разбор точек и группировка по населённому пункту (тип + название + муниципалитет)
const groups = new Map();
let noLoc = 0, noCoord = 0, outRegion = 0;
for (const f of features) {
  const p = f.properties;
  const place = parseLocation(p.location);
  if (!place) { noLoc++; continue; }
  const lat = Number(p._latitude ?? f.geometry?.coordinates?.[1]);
  const lng = Number(p._longitude ?? f.geometry?.coordinates?.[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { noCoord++; continue; }
  if (lat < 45.5 || lat > 51 || lng < 38 || lng > 44.7) { outRegion++; continue; } // вне Ростовской области: ошибка координат
  const key = `${placeKey(place)}|${p.district ?? ""}`;
  if (!groups.has(key)) groups.set(key, { place, district: p.district, items: [] });
  groups.get(key).items.push({ p, lat, lng });
}

// 2) слаги и названия; одинаковые названия разных мест различаем типом, затем муниципалитетом
const byName = new Map();
for (const g of groups.values()) { const k = g.place.name.toLowerCase().replace(/ё/g, "е"); byName.set(k, [...(byName.get(k) ?? []), g]); }
const usedSlugs = new Set(SKIP);
const cities = [];
const shelters = {};
let outliers = 0, dups = 0, people = 0;

for (const g of [...groups.values()].sort((a, b) => b.items.length - a.items.length)) {
  const same = byName.get(g.place.name.toLowerCase().replace(/ё/g, "е"));
  const sameType = same.filter((x) => x.place.type === g.place.type);
  let slug = slugify(g.place.name), name = g.place.name;
  const quals = [];
  if (same.length > 1) { slug += `-${g.place.type}`; quals.push(TYPE_LABEL[g.place.type]); }
  if (sameType.length > 1) { slug += `-${g.district}`; quals.push(`м.о. ${g.district}`); }
  if (quals.length) name += ` (${quals.join(", ")})`;
  if (SKIP.has(slug) || usedSlugs.has(slug)) { console.log("  пропуск (слаг занят):", slug); continue; }
  usedSlugs.add(slug);

  // выбросы: точки дальше 25 км от медианы населённого пункта (ошибки геокодирования)
  const mLat = median(g.items.map((i) => i.lat)), mLng = median(g.items.map((i) => i.lng));
  const ok = g.items.filter((i) => km(i.lat, i.lng, mLat, mLng) <= 25);
  outliers += g.items.length - ok.length;

  const seen = new Set();
  const list = [];
  for (const { p, lat, lng } of ok) {
    const address = cleanText(p.address).replace(/^(?:г\.|город|п\.|пос\.|ст\.|с\.|х\.|сл\.)\s*[А-Яа-яЁё-]+,\s*/i, "").replace(/\s+,/g, ",");
    if (!address) continue;
    const org = cleanText(p.name_organization);
    // дубль — только полностью совпадающая запись: в одном здании бывает несколько разных помещений
    const key = [address.toLowerCase(), lat.toFixed(5), lng.toFixed(5), org, p.num_sheltered, p.area].join("|");
    if (seen.has(key)) { dups++; continue; }
    seen.add(key);
    let holder, placement;
    if (!org || org === "-" || org === "—") holder = undefined;
    else if (/^МКД$/i.test(org)) placement = "МКД";
    else if (isPerson(org)) people++;
    else holder = org;
    const cap = Number(p.num_sheltered), area = Number(p.area);
    list.push({
      id: `${slug}-${String(list.length + 1).padStart(4, "0")}`,
      kind: "other_shelter",
      objectType: "Защитное помещение",
      ...(placement ? { placement } : {}),
      address,
      ...(holder ? { holder } : {}),
      ...(cap > 0 ? { capacity: Math.round(cap) } : {}),
      ...(area > 0 ? { area: Math.round(area * 10) / 10 } : {}),
      lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6,
      sourceUrl: SOURCE_URL,
      sourceUpdatedAt: (p._updated_at ?? "").slice(0, 10) || today,
      sourceCheckedAt: today,
    });
  }
  if (!list.length) continue;
  shelters[slug] = list;
  cities.push({ slug, name, ...cityBox(list), count: list.length, type: g.place.type });
}

cities.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
writeFileSync("data/gisro-cities.json", JSON.stringify(cities));
writeFileSync("data/gisro-shelters.json", JSON.stringify(shelters));
const total = Object.values(shelters).reduce((a, l) => a + l.length, 0);
console.log(`ok: населённых пунктов ${cities.length}, укрытий ${total} (из ${features.length}; Ростов не входит)`);
console.log(`  без названия: ${noLoc}; без координат: ${noCoord}; вне области: ${outRegion}; выбросы: ${outliers}; дубли: ${dups}; ФИО скрыто: ${people}`);
