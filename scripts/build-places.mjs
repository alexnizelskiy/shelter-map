// Сборка data/places-ru.json из дампа GeoNames (CC BY 4.0, https://www.geonames.org).
// Запуск: node scripts/build-places.mjs <папка с RU.txt, altnames.txt, admin1CodesASCII.txt>
// altnames.txt = alternatenames/RU.txt из https://download.geonames.org/export/dump/alternatenames/RU.zip
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Укажите папку с дампом GeoNames");

// GeoNames admin1 (английское имя) -> русское название региона
const REGION_RU = {
  "Yaroslavl Oblast": "Ярославская область", "Voronezh Oblast": "Воронежская область", "Vologda Oblast": "Вологодская область",
  "Volgograd Oblast": "Волгоградская область", Ulyanovsk: "Ульяновская область", "Udmurtiya Republic": "Удмуртская Республика",
  "Tver Oblast": "Тверская область", "Tula Oblast": "Тульская область", "Tatarstan Republic": "Республика Татарстан",
  "Tambov Oblast": "Тамбовская область", "Stavropol Kray": "Ставропольский край", "Smolensk Oblast": "Смоленская область",
  "Saratov Oblast": "Саратовская область", "Samara Oblast": "Самарская область", "Ryazan Oblast": "Рязанская область",
  Rostov: "Ростовская область", "Pskov Oblast": "Псковская область", "Perm Krai": "Пермский край", "Penza Oblast": "Пензенская область",
  "Oryol oblast": "Орловская область", "Orenburg Oblast": "Оренбургская область", "Novgorod Oblast": "Новгородская область",
  "North Ossetia–Alania": "Республика Северная Осетия — Алания", Nenets: "Ненецкий автономный округ", Murmansk: "Мурманская область",
  Moscow: "Москва", "Moscow Oblast": "Московская область", "Mordoviya Republic": "Республика Мордовия", "Mariy-El Republic": "Республика Марий Эл",
  "Lipetsk Oblast": "Липецкая область", "Leningradskaya Oblast'": "Ленинградская область", "St.-Petersburg": "Санкт-Петербург",
  "Kursk Oblast": "Курская область", "Krasnodar Krai": "Краснодарский край", "Kostroma Oblast": "Костромская область", Komi: "Республика Коми",
  "Kirov Oblast": "Кировская область", Karelia: "Республика Карелия", "Karachayevo-Cherkesiya Republic": "Карачаево-Черкесская Республика",
  "Kaluga Oblast": "Калужская область", "Kalmykiya Republic": "Республика Калмыкия", "Kaliningrad Oblast": "Калининградская область",
  "Kabardino-Balkariya Republic": "Кабардино-Балкарская Республика", "Ivanovo Oblast": "Ивановская область", "Ingushetiya Republic": "Республика Ингушетия",
  "Nizhny Novgorod Oblast": "Нижегородская область", Dagestan: "Республика Дагестан", "Chuvash Republic": "Чувашская Республика", Chechnya: "Чеченская Республика",
  "Bryansk Oblast": "Брянская область", "Belgorod Oblast": "Белгородская область", "Bashkortostan Republic": "Республика Башкортостан",
  "Astrakhan Oblast": "Астраханская область", Arkhangelskaya: "Архангельская область", "Adygeya Republic": "Республика Адыгея",
  "Vladimir Oblast": "Владимирская область", "Yamalo-Nenets": "Ямало-Ненецкий автономный округ", "Tyumen Oblast": "Тюменская область",
  "Republic of Tyva": "Республика Тыва", "Tomsk Oblast": "Томская область", "Sverdlovsk Oblast": "Свердловская область", "Omsk Oblast": "Омская область",
  "Novosibirsk Oblast": "Новосибирская область", "Kurgan Oblast": "Курганская область", "Krasnoyarsk Krai": "Красноярский край",
  "Khanty-Mansia": "Ханты-Мансийский автономный округ", "Khakasiya Republic": "Республика Хакасия", Kuzbass: "Кемеровская область",
  Altai: "Республика Алтай", Chelyabinsk: "Челябинская область", "Altai Krai": "Алтайский край", Sakha: "Республика Саха (Якутия)",
  Primorye: "Приморский край", Khabarovsk: "Хабаровский край", "Irkutsk Oblast": "Иркутская область", "Jewish Autonomous Oblast": "Еврейская автономная область",
  "Amur Oblast": "Амурская область", "Buryatiya Republic": "Республика Бурятия", "Sakhalin Oblast": "Сахалинская область", "Magadan Oblast": "Магаданская область",
  Kamchatka: "Камчатский край", Chukotka: "Чукотский автономный округ", "Zabaykalskiy (Transbaikal) Kray": "Забайкальский край",
};

const admin1 = new Map(); // "61" -> "Ростовская область"
for (const line of readFileSync(join(dir, "admin1CodesASCII.txt"), "utf8").split("\n")) {
  const [code, name] = line.split("\t");
  if (code?.startsWith("RU.")) admin1.set(code.slice(3), REGION_RU[name] ?? null);
}
const missing = [...admin1].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) console.warn("Нет русского названия региона для кодов:", missing.join(","));

// Русские названия: предпочтительное, иначе первое
const ru = new Map(); // geonameid -> {name, preferred}
const rl = createInterface({ input: createReadStream(join(dir, "altnames.txt"), "utf8") });
for await (const line of rl) {
  const f = line.split("\t");
  if (f[2] !== "ru" || !f[3]) continue;
  const pref = f[4] === "1";
  const cur = ru.get(f[1]);
  if (!cur || (pref && !cur.pref)) ru.set(f[1], { name: f[3], pref });
}

const KEEP = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC", "PPLL", "PPLG"]);
const RANK = { PPLC: 3, PPLA: 2, PPLA2: 1 };
const regions = [];
const regionIdx = new Map();
const places = [];
const pl = createInterface({ input: createReadStream(join(dir, "RU.txt"), "utf8") });
for await (const line of pl) {
  const f = line.split("\t");
  if (f[6] !== "P" || !KEEP.has(f[7])) continue;
  const alt = ru.get(f[0]);
  const name = alt?.name ?? (/[А-Яа-яЁё]/.test(f[1]) ? f[1] : null);
  if (!name) continue;
  const reg = admin1.get(f[10]) ?? "";
  if (!regionIdx.has(reg)) { regionIdx.set(reg, regions.length); regions.push(reg); }
  places.push([Number(f[0]), name, regionIdx.get(reg), Math.round(Number(f[4]) * 1e4) / 1e4, Math.round(Number(f[5]) * 1e4) / 1e4, Number(f[14]) || 0, RANK[f[7]] ?? 0]);
}
places.sort((a, b) => b[5] - a[5]);
writeFileSync("data/places-ru.json", JSON.stringify({ regions, places }));
console.log(`мест: ${places.length}, регионов: ${regions.length}`);
