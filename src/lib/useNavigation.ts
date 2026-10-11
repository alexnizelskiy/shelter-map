"use client";

import { useEffect, useRef, useState } from "react";
import { bearing, cumulative, currentStep, haversine, project, remainingLine, roundDist, stepStarts, type LngLat, type NavStep } from "./nav";

export type Variant = { distance: number; duration: number; coords: LngLat[]; steps: NavStep[] };

export type NavState = {
  pos: LngLat;
  heading: number | null;
  along: number; // метров пройдено по маршруту
  remaining: number;
  remainingSec: number;
  arrival: Date;
  stepIdx: number;
  next: NavStep | null; // ближайший манёвр
  then: NavStep | null; // следующий за ним
  distToNext: number;
  line: LngLat[]; // оставшаяся часть маршрута
  offRoute: boolean;
  arrived: boolean;
};

type Opts = {
  active: boolean;
  variant: Variant | null;
  mode: "foot" | "car";
  voice: boolean;
  sim: boolean; // демо-движение вдоль маршрута (для проверки без реального GPS)
  onReroute: (pos: LngLat) => void;
};

const OFF_ROUTE_M = { foot: 35, car: 60 };
const ARRIVE_M = { foot: 20, car: 35 };
const VOICE_AT = { foot: [80, 25], car: [300, 60] };

const speak = (text: string) => {
  try {
    if (typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
};

export function useNavigation({ active, variant, mode, voice, sim, onReroute }: Opts) {
  const [state, setState] = useState<NavState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const variantRef = useRef(variant);
  const voiceRef = useRef(voice);
  const rerouteRef = useRef(onReroute);
  const last = useRef<{ pos: LngLat; heading: number | null } | null>(null);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const spoken = useRef(new Set<string>());
  const geo = useRef<{ cum: number[]; starts: number[]; k: number } | null>(null);

  useEffect(() => { voiceRef.current = voice; rerouteRef.current = onReroute; }, [voice, onReroute]);

  // пересчёт при каждой новой позиции или смене маршрута
  const compute = useRef((pos: LngLat, heading: number | null) => {
    const v = variantRef.current;
    if (!v || !geo.current) return;
    const { cum, starts, k } = geo.current;
    const proj = project(v.coords, cum, pos);
    const alongSteps = proj.along * k;
    const idx = currentStep(starts, alongSteps);
    const remaining = Math.max(0, cum[cum.length - 1] - proj.along);
    const dest = v.coords[v.coords.length - 1];
    const arrived = haversine(pos, dest) < ARRIVE_M[mode] || remaining < ARRIVE_M[mode] / 2;
    const offRoute = proj.dist > OFF_ROUTE_M[mode];
    const next = v.steps[idx + 1] ?? null;
    const distToNext = Math.max(0, starts[idx + 1] - alongSteps);
    const sec = remaining * (v.duration / Math.max(1, v.distance));

    setState({
      pos, heading, along: proj.along, remaining, remainingSec: sec, arrival: new Date(Date.now() + sec * 1000), stepIdx: idx, next, then: v.steps[idx + 2] ?? null,
      distToNext, line: remainingLine(v.coords, proj), offRoute, arrived,
    });

    // автоматический пересчёт: 3 подряд позиции далеко от маршрута, не чаще раза в 12 секунд
    offCount.current = offRoute ? offCount.current + 1 : 0;
    if (offRoute && offCount.current >= 3 && Date.now() - lastReroute.current > 12000 && !arrived) {
      lastReroute.current = Date.now();
      offCount.current = 0;
      rerouteRef.current(pos);
    }

    // голосовые подсказки
    if (voiceRef.current && next) {
      const [far, near] = VOICE_AT[mode];
      const key = (lvl: number) => `${idx}:${lvl}`;
      if (arrived && !spoken.current.has("arr")) { spoken.current.add("arr"); speak("Вы прибыли к укрытию"); }
      else if (distToNext < near && !spoken.current.has(key(2))) { spoken.current.add(key(2)); speak(next.text); }
      else if (distToNext < far && distToNext >= near && !spoken.current.has(key(1)) && next.type !== "arrive") { spoken.current.add(key(1)); speak(`Через ${roundDist(distToNext)}. ${next.text}`); }
    }
  });

  // новый маршрут (после пересчёта) — пересобираем кэш геометрии и сразу обновляем состояние
  useEffect(() => {
    variantRef.current = variant;
    if (!variant) { geo.current = null; return; }
    const cum = cumulative(variant.coords);
    const total = variant.steps.reduce((s, st) => s + st.distance, 0);
    geo.current = { cum, starts: stepStarts(variant.steps), k: total > 0 ? total / Math.max(1, cum[cum.length - 1]) : 1 };
    spoken.current = new Set();
    offCount.current = 0;
    if (last.current) compute.current(last.current.pos, last.current.heading);
  }, [variant]);

  // источник позиции: GPS или демо-движение
  useEffect(() => {
    if (!active) return;
    let stop = () => {};
    let wake: { release: () => Promise<void> } | null = null;

    const push = (pos: LngLat, hdg: number | null) => {
      const prev = last.current;
      let heading = hdg;
      if ((heading == null || Number.isNaN(heading)) && prev && haversine(prev.pos, pos) > 4) heading = bearing(prev.pos, pos);
      if (heading == null) heading = prev?.heading ?? null;
      last.current = { pos, heading };
      compute.current(pos, heading);
    };

    if (sim) {
      const v = variantRef.current;
      if (!v) return;
      const cum = cumulative(v.coords);
      let dist = 0;
      const id = setInterval(() => {
        dist = Math.min(cum[cum.length - 1], dist + 55);
        let i = 0;
        while (i < cum.length - 2 && cum[i + 1] < dist) i++;
        const t = (dist - cum[i]) / Math.max(1, cum[i + 1] - cum[i]);
        const a = v.coords[i], b = v.coords[i + 1];
        push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing(a, b));
      }, 700);
      stop = () => clearInterval(id);
    } else if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      const id = navigator.geolocation.watchPosition(
        (p) => { setError(null); push([p.coords.longitude, p.coords.latitude], p.coords.speed != null && p.coords.speed > 0.8 ? p.coords.heading : null); },
        (e) => setError(e.code === 1 ? "Нет доступа к геопозиции. Разрешите её в настройках браузера." : "Не удаётся определить местоположение."),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
      stop = () => navigator.geolocation.clearWatch(id);
    }

    // экран не гаснет во время навигации
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((l) => { wake = l; }).catch(() => {});

    return () => {
      stop();
      wake?.release().catch(() => {});
      last.current = null;
      setState(null);
      setError(null);
      try { speechSynthesis.cancel(); } catch {}
    };
  }, [active, sim]);

  return { nav: active ? state : null, error };
}
