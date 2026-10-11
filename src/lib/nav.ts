// Геометрия навигатора: проекция позиции на маршрут, остаток пути, курс. Без зависимостей, чтобы легко тестировать.
export type LngLat = [number, number];
export type NavStep = { text: string; distance: number; duration: number; type: string; modifier: string | null; name: string; loc: LngLat };

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Курс из точки a в точку b, градусы по часовой от севера
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function cumulative(coords: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversine(coords[i - 1], coords[i]));
  return out;
}

export type Projection = { along: number; dist: number; index: number; point: LngLat };

// Ближайшая точка маршрута к позиции: сколько метров пройдено вдоль линии и как далеко позиция от неё
export function project(coords: LngLat[], cum: number[], p: LngLat): Projection {
  let best: Projection = { along: 0, dist: Infinity, index: 0, point: coords[0] };
  const kx = Math.cos(rad(p[1])) * 111320;
  const ky = 110574;
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = [(coords[i][0] - p[0]) * kx, (coords[i][1] - p[1]) * ky];
    const [bx, by] = [(coords[i + 1][0] - p[0]) * kx, (coords[i + 1][1] - p[1]) * ky];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.dist) {
      best = {
        along: cum[i] + t * (cum[i + 1] - cum[i]),
        dist: d,
        index: i,
        point: [coords[i][0] + t * (coords[i + 1][0] - coords[i][0]), coords[i][1] + t * (coords[i + 1][1] - coords[i][1])],
      };
    }
  }
  return best;
}

// Оставшаяся часть маршрута от спроецированной точки
export function remainingLine(coords: LngLat[], proj: Projection): LngLat[] {
  return [proj.point, ...coords.slice(proj.index + 1)];
}

// Индекс текущего шага: шаг i тянется от stepStart[i] до stepStart[i+1] (в метрах вдоль маршрута)
export function stepStarts(steps: NavStep[]): number[] {
  const out = [0];
  for (const s of steps) out.push(out[out.length - 1] + s.distance);
  return out;
}

export function currentStep(starts: number[], along: number): number {
  for (let i = 0; i < starts.length - 1; i++) if (along < starts[i + 1]) return i;
  return Math.max(0, starts.length - 2);
}

export const formatClock = (d: Date) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
export const roundDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} км` : m >= 100 ? `${Math.round(m / 50) * 50} м` : `${Math.max(10, Math.round(m / 10) * 10)} м`);
