import type { StyleSpecification } from "maplibre-gl";
import { type Basemap } from "./basemaps";

// Пустой стиль: подложка добавляется слоем и переключается на лету в CityMap.
export const emptyStyle: StyleSpecification = { version: 8, sources: {}, layers: [] };

export const rasterSource = (src: string, b: Basemap) => ({ type: "raster" as const, tiles: [src], tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution });
