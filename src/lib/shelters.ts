export type ShelterKind = "official_shelter" | "other_shelter" | "help_point" | "unknown";

export type Tri = "yes" | "no";
export type Access = { stepFree?: Tri; pets?: Tri; hours?: string };

export type Shelter = {
  id: string;
  kind: ShelterKind;
  objectType: string; // как назван объект в источнике, напр. «Заглубленное помещение»
  placement?: string; // «здании» / «МКД»
  address: string;
  holder?: string; // организация / ориентир из источника
  capacity?: number;
  area?: number; // площадь помещения, м² (если есть в источнике)
  lat: number;
  lng: number;
  origin?: "official" | "community"; // community = добавлено по заявке жителя и проверено модератором
  sourceUrl?: string;
  access?: Access; // доступность: подтверждённые сведения (если есть)
  sourceUpdatedAt: string; // дата обновления данных самим источником
  sourceCheckedAt: string; // когда мы сверили с источником
};

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

// Лёгкий список точек всех городов для фонового слоя карты: p = [id, lat, lng, индекс вида в k, индекс города в slugs]
export type MapPoints = { slugs: string[]; k: string[]; p: [string, number, number, number, number][] };
