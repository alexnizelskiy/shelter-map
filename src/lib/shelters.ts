import rostov from "../../data/rostov-na-donu.json";

export type ShelterKind = "official_shelter" | "other_shelter" | "help_point" | "unknown";

export type Shelter = {
  id: string;
  kind: ShelterKind;
  address: string;
  landmark?: string;
  capacity?: number;
  lat: number;
  lng: number;
  sourceUrl: string;
  sourceCheckedAt: string; // ISO date
};

const BY_CITY: Record<string, Shelter[]> = {
  "rostov-na-donu": rostov as Shelter[],
};

export const getShelters = (citySlug: string): Shelter[] => BY_CITY[citySlug] ?? [];

export const KIND_LABEL: Record<ShelterKind, string> = {
  official_shelter: "Убежище (официальный список)",
  other_shelter: "Другое укрытие",
  help_point: "Пункт помощи",
  unknown: "Тип не подтверждён",
};

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
