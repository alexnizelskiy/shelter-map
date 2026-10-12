import rostov from "../../data/rostov-na-donu.json";
import gisro from "../../data/gisro-shelters.json";
import type { Shelter } from "./shelters";

// Списки укрытий по городам. Только для сервера: файлы большие, в браузер они не попадают (клиент получает список города через props).
const BY_CITY: Record<string, Shelter[]> = {
  "rostov-na-donu": rostov as Shelter[],
  ...(gisro as unknown as Record<string, Shelter[]>),
};

export const getShelters = (citySlug: string): Shelter[] => BY_CITY[citySlug] ?? [];
