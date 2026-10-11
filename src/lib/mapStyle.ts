import type { StyleSpecification } from "maplibre-gl";

// URL-шаблон растровых тайлов задаётся окружением (ключ не хранится в коде).
// Пример см. в .env.example (Яндекс Tiles API, projection=web_mercator).
// Если в переменной лежит только ключ Яндекса (не URL), шаблон собираем сами.
const yandex = (key: string) =>
  `https://tiles.api-maps.yandex.ru/v1/tiles/?apikey=${key}&lang=ru_RU&x={x}&y={y}&z={z}&l=map&projection=web_mercator`;
const RAW = (process.env.NEXT_PUBLIC_TILES_URL || "").trim();
const TILES = !RAW ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png" : /^https?:\/\//.test(RAW) ? RAW : yandex(RAW);
const ATTRIBUTION = process.env.NEXT_PUBLIC_TILES_ATTRIBUTION || "© участники OpenStreetMap";

export const mapStyle: StyleSpecification = {
  version: 8,
  sources: { base: { type: "raster", tiles: [TILES], tileSize: 256, maxzoom: 20, attribution: ATTRIBUTION } },
  layers: [{ id: "base", type: "raster", source: "base" }],
};
