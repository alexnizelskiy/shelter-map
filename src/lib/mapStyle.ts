import type { StyleSpecification } from "maplibre-gl";

// URL-шаблон растровых тайлов задаётся окружением (ключ не хранится в коде).
// Пример см. в .env.example (Яндекс Tiles API, projection=web_mercator).
const TILES = process.env.NEXT_PUBLIC_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_TILES_ATTRIBUTION || "© участники OpenStreetMap";

export const mapStyle: StyleSpecification = {
  version: 8,
  sources: { base: { type: "raster", tiles: [TILES], tileSize: 256, maxzoom: 20, attribution: ATTRIBUTION } },
  layers: [{ id: "base", type: "raster", source: "base" }],
};
