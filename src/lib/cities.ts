export type City = {
  slug: string;
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
};

export const CITIES: City[] = [
  { slug: "rostov-na-donu", name: "Ростов-на-Дону", center: [39.7203, 47.2224], zoom: 11 },
];

export const getCity = (slug: string) => CITIES.find((c) => c.slug === slug);
