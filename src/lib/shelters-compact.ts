import type { Access, Shelter, ShelterKind } from "./shelters";

// Компактный вид для офлайна и режима «Тревога»: короткие ключи, чтобы список города умещался в localStorage (~200 КБ на 1400 точек)
export type Compact = { i: string; a: string; h?: string; c?: number; y: number; x: number; k: ShelterKind; t: string; o?: 1; s?: Access };

export const toCompact = (s: Shelter): Compact => ({
  i: s.id, a: s.address, h: s.holder, c: s.capacity, y: s.lat, x: s.lng, k: s.kind,
  t: `${s.objectType}${s.placement ? ` в ${s.placement}` : ""}`, o: s.origin === "community" ? 1 : undefined, s: s.access,
});

export type Alarmable = { id: string; address: string; holder?: string; capacity?: number; lat: number; lng: number; type: string; community: boolean; access?: Access };
export const fromCompact = (c: Compact): Alarmable => ({ id: c.i, address: c.a, holder: c.h, capacity: c.c, lat: c.y, lng: c.x, type: c.t, community: c.o === 1, access: c.s });
