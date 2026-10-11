import rostov from "../../data/rostov-na-donu.json";

export type ShelterKind = "official_shelter" | "other_shelter" | "help_point" | "unknown";

export type Shelter = {
  id: string;
  kind: ShelterKind;
  objectType: string; // как назван объект в источнике, напр. «Заглубленное помещение»
  placement?: string; // «здании» / «МКД»
  address: string;
  holder?: string; // организация / ориентир из источника
  capacity?: number;
  lat: number;
  lng: number;
  origin?: "official" | "community"; // community = добавлено по заявке жителя и проверено модератором
  sourceUrl?: string;
  sourceUpdatedAt: string; // дата обновления данных самим источником
  sourceCheckedAt: string; // когда мы сверили с источником
};

const BY_CITY: Record<string, Shelter[]> = {
  "rostov-na-donu": rostov as Shelter[],
};

export const getShelters = (citySlug: string): Shelter[] => BY_CITY[citySlug] ?? [];

export const KIND_LABEL: Record<ShelterKind, string> = {
  official_shelter: "Убежище (официальный список)",
  other_shelter: "Защитное помещение (список администрации)",
  help_point: "Пункт помощи",
  unknown: "Тип не подтверждён",
};

export const fmtDate = (iso: string) => iso.split("-").reverse().join(".");

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
