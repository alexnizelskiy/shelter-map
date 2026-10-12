// Разбор данных ГИС Ростовской области (слой «Карта укрытий»): названия населённых пунктов, ФИО, выбросы по координатам.
const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
export const slugify = (s) => s.toLowerCase().split("").map((c) => TR[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// Тип населённого пункта → префикс в источнике. Порядок важен: «р.п.» раньше «п.», «ст-ца» раньше «с.»
const PREFIXES = [
  ["рп", /^(?:р\.\s*п\.|рабочий\s+пос[её]лок)\s*/i],
  ["г", /^(?:г\.|город(?=\s))\s*/i],
  ["ст", /^(?:ст-ца\.?|ст\.|станица(?=\s))\s*/i],
  ["сл", /^(?:сл\.|слобода(?=\s))\s*/i],
  ["п", /^(?:пос\.|п\.|пос[её]лок(?=\s))\s*/i],
  ["с", /^(?:с\.|село(?=\s))\s*/i],
  ["х", /^(?:х\.|хутор(?=\s))\s*/i],
];
export const TYPE_LABEL = { г: "город", рп: "р.п.", п: "посёлок", ст: "станица", с: "село", х: "хутор", сл: "слобода" };

// Опечатки в источнике (тип|название → верное название)
const ALIASES = { "г|Донецка": "Донецк", "с|Екатеринока": "Екатериновка" };

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const keyOf = (s) => s.toLowerCase().replace(/ё/g, "е");

// «г. Донецка» / «п.Рассвет» / «ст-ца Николаевская» / «шахты» → { type, name }
export function parseLocation(raw) {
  const s = String(raw ?? "").replace(/[ \s]+/g, " ").trim();
  if (!s) return null;
  for (const [type, re] of PREFIXES) {
    const m = re.exec(s);
    if (m) {
      const name = cap(s.slice(m[0].length).trim());
      if (!name) return null;
      return { type, name: ALIASES[`${type}|${name}`] ?? name };
    }
  }
  return { type: "г", name: ALIASES[`г|${cap(s)}`] ?? cap(s) }; // без префикса: в источнике так записаны «Шахты»
}
export const placeKey = (p) => `${p.type}|${keyOf(p.name)}`;

// ФИО частных лиц: персональные данные на карте не показываем
const FIO = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/;
const INITIALS = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.?$/;
const withPrefix = (re) => new RegExp(`^(?:ИП|ТСЖ|ЖСК|ТСН|СНТ|ГСК)\\s+${re.source.slice(1, -1)}$`);
export const isPerson = (s) => FIO.test(s) || INITIALS.test(s) || withPrefix(FIO).test(s) || withPrefix(INITIALS).test(s);

export const cleanText = (v) => String(v ?? "").replace(/[ \s]+/g, " ").replace(/"\s+/g, '"').replace(/\s+"(?=\s|$)/g, '"').trim();

const R = Math.PI / 180;
export const km = (aLat, aLng, bLat, bLng) => Math.hypot((aLat - bLat) * 111.2, (aLng - bLng) * 111.2 * Math.cos(aLat * R));
export const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Границы и масштаб карты по точкам населённого пункта (с запасом: границу используют и для предложений новых мест)
export function cityBox(points) {
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const dLat = Math.max(...lats) - Math.min(...lats), dLng = Math.max(...lngs) - Math.min(...lngs);
  const span = Math.max(dLng, dLat * 1.4);
  const padLng = Math.max(0.04, dLng * 0.35), padLat = Math.max(0.03, dLat * 0.35);
  const round = (n) => Math.round(n * 1e5) / 1e5;
  return {
    center: [round((Math.max(...lngs) + Math.min(...lngs)) / 2), round((Math.max(...lats) + Math.min(...lats)) / 2)],
    bbox: [round(Math.min(...lngs) - padLng), round(Math.min(...lats) - padLat), round(Math.max(...lngs) + padLng), round(Math.max(...lats) + padLat)],
    zoom: span >= 0.3 ? 11 : span >= 0.15 ? 12 : span >= 0.06 ? 13 : span >= 0.02 ? 14 : 15,
  };
}
