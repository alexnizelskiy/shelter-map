// Разбор официальной карты администрации Ростова-на-Дону (Яндекс Конструктор карт)
// в data/rostov-na-donu.json. Запуск: node scripts/import-rostov.mjs
import { readFileSync, writeFileSync } from "node:fs";

const raw = JSON.parse(readFileSync("data/raw/rostov-admin-usermap.json", "utf8"));
const SOURCE_URL = `https://yandex.ru/maps/39/rostov-na-donu/?mode=usermaps&um=${raw.id}&z=12`;
const sourceUpdatedAt = new Date(Number(raw.lastUpdated) * 1000).toISOString().slice(0, 10);

// «<тип> в <размещение> по адресу: <адрес> (<организация/ориентир>), вместимость – N чел.»
const RE = /^(?<object>.+?)(?:\s+в\s+(?<placement>.+?))?\s+по адресу:\s*(?<address>.+?)(?:\s*\((?<holder>[^()]*(?:\([^()]*\)[^()]*)*)\))?\s*,\s*вместимость\s*[–—-]\s*(?<cap>\d+)\s*чел/i;

const out = [];
const bad = [];
raw.features.forEach((f, i) => {
  const m = RE.exec(f.title.replace(/\s+/g, " ").trim());
  if (!m) return bad.push(f.title);
  const g = m.groups;
  out.push({
    id: `rnd-${String(i + 1).padStart(4, "0")}`,
    kind: "other_shelter",
    objectType: g.object.trim(),
    placement: g.placement?.trim(),
    address: g.address.replace(/^г\.\s*Ростов-на-Дону,\s*/i, "").replace(/\s+,/g, ",").trim(),
    holder: g.holder?.trim() || undefined,
    capacity: Number(g.cap),
    lat: f.coordinates[1],
    lng: f.coordinates[0],
    sourceUrl: SOURCE_URL,
    sourceUpdatedAt,
    sourceCheckedAt: raw.fetchedAt,
  });
});

writeFileSync("data/rostov-na-donu.json", JSON.stringify(out));
console.log(`ok: ${out.length}, не разобрано: ${bad.length}`);
bad.slice(0, 10).forEach((t) => console.log("  ?", t));
