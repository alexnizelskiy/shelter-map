import type { MapPoints } from "./shelters";

// Какому городу принадлежит область под центром карты: берём город ближайшей к центру точки, если она рядом (до 12 км)
// и заметно ближе, чем точки текущего города (запас 1,5 км, чтобы на границе город не мигал туда-сюда).
export function cityAt(pts: MapPoints, lng: number, lat: number, cur: string): string | null {
  const curIdx = pts.slugs.indexOf(cur);
  const cos = Math.cos((lat * Math.PI) / 180);
  let best = Infinity, owner = -1, mine = Infinity;
  for (const [, y, x, , ci] of pts.p) {
    const dy = (y - lat) * 111.2, dx = (x - lng) * 111.2 * cos;
    const d = dx * dx + dy * dy;
    if (d < best) { best = d; owner = ci; }
    if (ci === curIdx && d < mine) mine = d;
  }
  if (owner < 0 || owner === curIdx) return null;
  const d1 = Math.sqrt(best), d0 = Math.sqrt(mine);
  return d1 < 12 && (d0 - d1 > 1.5 || d0 > 15) ? pts.slugs[owner] : null;
}
