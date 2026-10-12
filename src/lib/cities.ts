import gisro from "../../data/gisro-cities.json";

export type City = {
  slug: string;
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat] — допустимая область для предложений
  fit?: [number, number, number, number]; // границы, в которые вписывается карта при открытии (для найденных мест)
  place?: { id: number; region: string }; // виртуальный город из каталога населённых пунктов
  minor?: boolean; // небольшой населённый пункт: на главной показывается в свёрнутом списке
};

type Gisro = { slug: string; name: string; center: [number, number]; zoom: number; bbox: [number, number, number, number]; count: number; type: string };

// Ростов — по карте администрации города; остальные населённые пункты — из ГИС Ростовской области (scripts/import-gisro.mjs)
export const CITIES: City[] = [
  { slug: "rostov-na-donu", name: "Ростов-на-Дону", center: [39.7203, 47.2224], zoom: 11, bbox: [39.3, 47.05, 40.1, 47.45] },
  ...(gisro as Gisro[]).map((c): City => ({ slug: c.slug, name: c.name, center: c.center, zoom: c.zoom, bbox: c.bbox, minor: c.type !== "г" && c.type !== "рп" && c.count < 10 })),
];

export const getCity = (slug: string) => CITIES.find((c) => c.slug === slug);
