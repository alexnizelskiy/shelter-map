// «Моё укрытие»: до трёх мест (дом, работа, другое) хранятся на устройстве вместе с координатами и адресом, поэтому работают без сети
export type MyShelter = { id: string; city: string; label: "home" | "work" | "other"; address: string; holder?: string; capacity?: number; lat: number; lng: number };
export const LABELS: Record<MyShelter["label"], string> = { home: "Дом", work: "Работа", other: "Другое" };
export const MY_KEY = "my-shelters";

export function parseMy(raw: string): MyShelter[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && Number.isFinite(x.lat) && Number.isFinite(x.lng)).slice(0, 3) : [];
  } catch { return []; }
}

export function withShelter(list: MyShelter[], s: MyShelter): MyShelter[] {
  // одно укрытие на одну метку; то же место под другой меткой переносится
  return [s, ...list.filter((x) => x.label !== s.label && x.id !== s.id)].slice(0, 3);
}
