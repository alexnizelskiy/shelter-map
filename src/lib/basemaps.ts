export type Basemap = {
  id: string;
  label: string;
  hint: string;
  tiles: string;
  attribution: string;
  maxzoom: number;
  overlay?: string; // подписи поверх спутника
  keepColors?: boolean; // не инвертировать в тёмной теме (спутник)
};

const strip = (v: string) => v.trim().replace(/^["'`“”«]+|["'`“”»]+$/g, "").trim();
const RAW = strip(process.env.NEXT_PUBLIC_TILES_URL || "");
const isUrl = /^https?:\/\//.test(RAW);
const YANDEX_ATTR = strip(process.env.NEXT_PUBLIC_TILES_ATTRIBUTION || "") || "© Яндекс";

// Ключ Яндекса берём либо из самой переменной, либо из параметра apikey в URL.
const yandexKey = isUrl ? (/[?&]apikey=([^&]+)/.exec(RAW)?.[1] ?? "") : RAW;
const yandex = (maptype: string) =>
  `https://tiles.api-maps.yandex.ru/v1/tiles/?apikey=${yandexKey}&lang=ru_RU&x={x}&y={y}&z={z}&l=map&maptype=${maptype}&projection=web_mercator`;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ESRI_ATTR = "Esri, Maxar, Earthstar Geographics";

export const BASEMAPS: Basemap[] = [
  ...(yandexKey
    ? [
        { id: "yandex", label: "Яндекс", hint: "Схема города", tiles: yandex("map"), attribution: YANDEX_ATTR, maxzoom: 20 },
        { id: "yandex-new", label: "Яндекс (новый дизайн)", hint: "Обновлённая схема", tiles: yandex("future_map"), attribution: YANDEX_ATTR, maxzoom: 20 },
      ]
    : isUrl
      ? [{ id: "custom", label: "Основная", hint: "Схема города", tiles: RAW, attribution: YANDEX_ATTR, maxzoom: 20 }]
      : []),
  { id: "osm", label: "OpenStreetMap", hint: "Открытая карта", tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© участники OpenStreetMap", maxzoom: 19 },
  { id: "sat", label: "Спутник", hint: "Снимки Esri", tiles: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attribution: ESRI_ATTR, maxzoom: 19, keepColors: true },
  {
    id: "hybrid", label: "Гибрид", hint: "Спутник с подписями", tiles: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attribution: ESRI_ATTR, maxzoom: 19, keepColors: true,
    overlay: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
  },
];

export const DEFAULT_BASEMAP = BASEMAPS[0].id;
export const getBasemap = (id: string | undefined) => BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
