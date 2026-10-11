// Русские подсказки из манёвров OSRM.
type Step = { maneuver: { type: string; modifier?: string; exit?: number }; name?: string; distance: number };

const TURN: Record<string, string> = {
  uturn: "Развернитесь",
  "sharp right": "Резко поверните направо",
  right: "Поверните направо",
  "slight right": "Держитесь правее",
  straight: "Двигайтесь прямо",
  "slight left": "Держитесь левее",
  left: "Поверните налево",
  "sharp left": "Резко поверните налево",
};

export function stepText(s: Step): string {
  const { type, modifier, exit } = s.maneuver;
  // названия улиц приходят в именительном падеже, поэтому не склоняем: «Поверните направо — улица Ленина»
  const on = s.name ? ` — ${s.name}` : "";
  const by = s.name ? ` — ${s.name}` : "";
  if (type === "depart") return `Начните движение${by}`;
  if (type === "arrive") return "Вы прибыли к укрытию";
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn") return `На кольце сверните на ${exit ?? 1}-й съезд${on}`;
  if (type === "exit roundabout" || type === "exit rotary") return `Съезжайте с кольца${on}`;
  if (type === "continue" || type === "new name" || type === "notification") return modifier && modifier !== "straight" ? `${TURN[modifier] ?? "Продолжайте"}${on}` : `Продолжайте движение${by}`;
  return `${(modifier && TURN[modifier]) || "Продолжайте движение"}${on}`;
}
