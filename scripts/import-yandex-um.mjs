// Укрытия из «Конструктора карт» Яндекса (виджет map-widget) → data/extra-cities.json и data/extra-shelters.json
// Запуск: node scripts/import-yandex-um.mjs reutov           (скачивает)   |   OFFLINE=1 node scripts/import-yandex-um.mjs reutov
// Источники описаны в SOURCES ниже. Ростов и города области из ГИС РО собираются другими скриптами и сюда не входят.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cityBox, cleanText, slugify } from "./gisro-lib.mjs";

const SOURCES = {
  reutov: {
    name: "Реутов", region: "Московская область", prefix: /^Московская область,\s*Реутов,\s*/i,
    um: "constructor:15b721456cd5e742b103509206a7d4533aabc97baaaa127d08bb588144292a8e",
    page: "https://yandex.ru/maps/21621/reutov/?mode=usermaps&um=constructor:15b721456cd5e742b103509206a7d4533aabc97baaaa127d08bb588144292a8e&z=12",
  },
};

const key = process.argv[2];
const src = SOURCES[key];
if (!src) { console.error(`Использование: node scripts/import-yandex-um.mjs ${Object.keys(SOURCES).join("|")}`); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const RAW = `data/raw/${key}-usermap.json`;

let map;
if (process.env.OFFLINE && existsSync(RAW)) map = JSON.parse(readFileSync(RAW, "utf8"));
else {
  const r = await fetch(`https://yandex.ru/map-widget/v1/?um=${encodeURIComponent(src.um)}&source=constructor`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(40_000) });
  if (!r.ok) throw new Error(`Яндекс: ${r.status}`);
  const html = await r.text();
  const json = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) throw new Error("В виджете не найдены данные карты");
  const um = JSON.parse(json).userMap;
  map = { id: um.id, title: um.title, lastUpdated: um.lastUpdated, fetchedAt: today, features: um.features.map((f) => ({ title: f.title ?? "", subtitle: f.subtitle ?? "", coordinates: f.coordinates })) };
  writeFileSync(RAW, JSON.stringify(map));
}
const updated = new Date(Number(map.lastUpdated) * 1000).toISOString().slice(0, 10);

// Разбор подписи: «Организация» + «адрес / тип / вместимость / S = … кв.м». У некоторых точек всё в заголовке («Укрытие №1 …»).
const rows = [];
let skipped = 0;
const seen = new Set();
for (const f of map.features) {
  const text = `${f.title}\n${f.subtitle}`.replace(/\t/g, " ");
  const cap = /вместимост[ьи]\s*[-–—:]?\s*(\d[\d\s]*?)\s*чел/i.exec(text);
  const rest = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const addrLine = rest.find((l) => src.prefix.test(l));
  if (!cap || !addrLine) { skipped++; continue; } // без вместимости или адреса это не укрытие (например, жилой дом из списка «укрываются жители»)
  let address = cleanText(addrLine.replace(src.prefix, "").split(/,\s*(?:ЗС ГО|Подземн|подвал|вместимост)/i)[0]);
  if (!address) { skipped++; continue; }
  // тип и размещение
  const typeLine = rest.find((l) => /ЗС ГО|подвал|паркинг|переход|укрыти/i.test(l) && !src.prefix.test(l)) ?? addrLine;
  const placement = /подземн[а-яё]*\s+паркинг/i.test(typeLine) ? "подземном паркинге" : /подвал/i.test(typeLine) ? "подвале жилого дома" : /пешеходн[а-яё]*\s+переход/i.test(typeLine) ? "подземном переходе" : undefined;
  const objectType = /пешеходн[а-яё]*\s+переход/i.test(typeLine) ? "Подземный пешеходный переход" : /ЗС ГО/i.test(typeLine) ? "ЗС ГО типа укрытие" : "Защитное помещение";
  const orgRaw = cleanText(f.title);
  const holder = orgRaw && !/^Укрытие №/i.test(orgRaw) && !src.prefix.test(orgRaw) && !/ПОДЗЕМНЫЕ ПЕШЕХОДНЫЕ ПЕРЕХОДЫ/i.test(orgRaw) ? orgRaw : undefined;
  const area = /S\s*=\s*(\d+(?:[.,]\d+)?)/i.exec(text)?.[1];
  const [lng, lat] = f.coordinates;
  const dupKey = [address.toLowerCase(), lat.toFixed(5), lng.toFixed(5), cap[1].replace(/\s/g, "")].join("|");
  if (seen.has(dupKey)) { skipped++; continue; }
  seen.add(dupKey);
  rows.push({ address, objectType, placement, holder, capacity: Number(cap[1].replace(/\s/g, "")), area: area ? Math.round(Number(area.replace(",", ".")) * 10) / 10 : undefined, lat, lng });
}

const slug = slugify(src.name);
const shelters = rows.map((r, i) => ({
  id: `${slug}-${String(i + 1).padStart(4, "0")}`,
  kind: "other_shelter",
  objectType: r.objectType,
  ...(r.placement ? { placement: r.placement } : {}),
  address: r.address,
  ...(r.holder ? { holder: r.holder } : {}),
  capacity: r.capacity,
  ...(r.area ? { area: r.area } : {}),
  lat: r.lat, lng: r.lng,
  sourceUrl: src.page,
  sourceUpdatedAt: updated,
  sourceCheckedAt: today,
}));
const city = { slug, name: src.name, region: src.region, ...cityBox(shelters), count: shelters.length, type: "г" };

// файлы накапливают все источники этого скрипта
const cp = "data/extra-cities.json", sp = "data/extra-shelters.json";
const cities = (existsSync(cp) ? JSON.parse(readFileSync(cp, "utf8")) : []).filter((c) => c.slug !== slug);
const all = existsSync(sp) ? JSON.parse(readFileSync(sp, "utf8")) : {};
cities.push(city); all[slug] = shelters;
writeFileSync(cp, JSON.stringify(cities));
writeFileSync(sp, JSON.stringify(all));
console.log(`ok: ${src.name}: ${shelters.length} укрытий (пропущено ${skipped} из ${map.features.length}); данные карты от ${updated}`);
console.log(JSON.stringify(shelters[0]));
console.log(JSON.stringify(shelters.at(-1)));
