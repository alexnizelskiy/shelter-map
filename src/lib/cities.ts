export type City = {
  slug: string;
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat] — допустимая область для предложений
  fit?: [number, number, number, number]; // границы, в которые вписывается карта при открытии (для найденных мест)
  place?: { id: number; region: string }; // виртуальный город из каталога населённых пунктов
};

export const CITIES: City[] = [
  { slug: "rostov-na-donu", name: "Ростов-на-Дону", center: [39.7203, 47.2224], zoom: 11, bbox: [39.3, 47.05, 40.1, 47.45] },
];

export const getCity = (slug: string) => CITIES.find((c) => c.slug === slug);
