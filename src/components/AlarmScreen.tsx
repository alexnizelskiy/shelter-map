"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Compass, Footprints, MapPin, Navigation2, Route, Siren, Star, TriangleAlert, WifiOff, Accessibility, PawPrint, Clock4 } from "lucide-react";
import { bearing, haversine, roundDist } from "@/lib/nav";
import { fromCompact, type Alarmable, type Compact } from "@/lib/shelters-compact";
import { LABELS, MY_KEY, parseMy, type MyShelter } from "@/lib/my-shelters";
import { usePref } from "@/lib/use-pref";
import { useCompass } from "@/lib/useCompass";
import Spinner from "./Spinner";
import Checklist from "./Checklist";

const DEFAULT_SLUG = "rostov-na-donu";
const CACHE = (slug: string) => `alarm-cache:${slug}`;
const CARDINALS = ["север", "северо-восток", "восток", "юго-восток", "юг", "юго-запад", "запад", "северо-запад"];
const cardinal = (deg: number) => CARDINALS[Math.round(deg / 45) % 8];

const subscribeOnline = (cb: () => void) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; };

type Pos = { lat: number; lng: number; acc: number };
type Item = Alarmable & { dist: number; mine?: MyShelter };

// Минимальный экран на случай тревоги: ближайшее укрытие, расстояние, направление, одна кнопка. Работает без сети (данные и «Моё укрытие» хранятся на устройстве).
export default function AlarmScreen() {
  const [choice] = usePref("city-choice", "");
  const [myRaw] = usePref(MY_KEY, "[]");
  const my = useMemo(() => parseMy(myRaw), [myRaw]);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const compass = useCompass();

  const [pos, setPos] = useState<Pos | null>(null);
  const [gps, setGps] = useState<"asking" | "ok" | "denied" | "unavailable">("asking");
  const [posSlug, setPosSlug] = useState<string | null>(null);
  const [data, setData] = useState<{ slug: string; name: string; list: Alarmable[]; cached: boolean } | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [stepFree, setStepFree] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  // 1) геопозиция в реальном времени
  useEffect(() => {
    if (!("geolocation" in navigator)) { const t = setTimeout(() => setGps("unavailable"), 0); return () => clearTimeout(t); }
    const id = navigator.geolocation.watchPosition(
      (p) => { setGps("ok"); setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
      (e) => setGps(e.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // 2) по позиции уточняем город (если там есть данные), один раз
  const posKey = pos ? `${pos.lat.toFixed(2)},${pos.lng.toFixed(2)}` : "";
  useEffect(() => {
    if (!posKey || posSlug) return;
    let alive = true;
    fetch(`/api/places?near=${posKey}`).then((r) => r.json()).then((j) => { const r = j.results?.[0]; if (alive && r?.hasData) setPosSlug(r.slug); }).catch(() => {});
    return () => { alive = false; };
  }, [posKey, posSlug]);

  const slug = posSlug ?? (choice && !choice.startsWith("p-") ? choice : DEFAULT_SLUG);

  // 3) список укрытий: сеть, а если её нет — копия на устройстве
  useEffect(() => {
    let alive = true;
    const fromCache = () => {
      try {
        const c = JSON.parse(localStorage.getItem(CACHE(slug)) ?? "null");
        if (c?.shelters) { setData({ slug, name: c.name ?? slug, list: (c.shelters as Compact[]).map(fromCompact), cached: true }); setLoadErr(false); return true; }
      } catch {}
      return false;
    };
    fetch(`/api/shelters?city=${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((j) => {
        if (!alive) return;
        try { localStorage.setItem(CACHE(slug), JSON.stringify({ name: j.city.name, shelters: j.shelters, at: j.at })); } catch {}
        setData({ slug, name: j.city.name, list: (j.shelters as Compact[]).map(fromCompact), cached: false });
        setLoadErr(false);
      })
      .catch(() => { if (alive && !fromCache()) setLoadErr(true); });
    return () => { alive = false; };
  }, [slug]);

  // 4) расстояния и выбор главного укрытия
  const items = useMemo<Item[]>(() => {
    if (!pos || !data) return [];
    const here: [number, number] = [pos.lng, pos.lat];
    let list: Item[] = data.list.map((s) => ({ ...s, dist: haversine(here, [s.lng, s.lat]) }));
    if (stepFree) { const only = list.filter((s) => s.access?.stepFree === "yes"); if (only.length) list = only; }
    return list.sort((a, b) => a.dist - b.dist).slice(0, 30);
  }, [pos, data, stepFree]);

  const myItems = useMemo<Item[]>(() => my.map((m) => ({
    id: m.id, address: m.address, holder: m.holder, capacity: m.capacity, lat: m.lat, lng: m.lng, type: `Моё укрытие · ${LABELS[m.label]}`, community: false, mine: m,
    dist: pos ? haversine([pos.lng, pos.lat], [m.lng, m.lat]) : Infinity,
  })).sort((a, b) => a.dist - b.dist), [my, pos]);

  // «Моё укрытие» выигрывает, если оно не дальше ближайшего больше чем на 300 м и ближе 3 км
  const best = useMemo(() => {
    const nearest = items[0];
    const mine = myItems[0];
    if (mine && mine.dist < 3000 && (!nearest || mine.dist <= nearest.dist + 300)) return mine;
    return nearest ?? mine ?? null;
  }, [items, myItems]);

  const main = (picked ? [...items, ...myItems].find((x) => x.id === picked) : null) ?? best;
  const others = items.filter((s) => s.id !== main?.id).slice(0, 3);
  const city = (main?.mine?.city ?? data?.slug) ?? slug;

  const brg = pos && main ? bearing([pos.lng, pos.lat], [main.lng, main.lat]) : null;
  const rel = brg != null && compass.heading != null ? (brg - compass.heading + 360) % 360 : brg;
  const walkMin = main && Number.isFinite(main.dist) ? Math.max(1, Math.round((main.dist * 1.3) / 1.25 / 60)) : null;
  const goHref = main ? `/${city}?go=${encodeURIComponent(main.id)}` : "/";
  const ext = main ? { ya: `https://yandex.ru/maps/?rtext=~${main.lat},${main.lng}&rtt=pd`, gis: `https://2gis.ru/routeSearch/rsType/pedestrian/to/${main.lng},${main.lat}` } : null;

  return (
    <main className="alarm">
      <header className="alarm-head">
        <Link href={`/${slug}`} className="icon-btn big" aria-label="Закрыть режим тревоги"><ArrowLeft size={20} /></Link>
        <h1><Siren size={22} />Режим тревоги</h1>
        {!online && <span className="chip warnchip"><WifiOff size={14} />Нет сети</span>}
      </header>

      <p className="alarm-warn"><TriangleAlert size={18} />Слышите сигнал — идите в ближайшее укрытие. Не пользуйтесь лифтом. Возьмите документы, телефон и воду. Следуйте оповещениям МЧС.</p>

      {gps === "asking" && !pos && <div className="alarm-wait"><Spinner size={22} />Определяем, где вы находитесь…</div>}
      {(gps === "denied" || gps === "unavailable") && !pos && (
        <div className="card alarm-card">
          <p><b>{gps === "denied" ? "Нет доступа к геопозиции" : "Не удаётся определить местоположение"}</b></p>
          <p className="note" style={{ margin: 0 }}>Разрешите доступ к геопозиции в настройках браузера и обновите страницу. Пока можно открыть сохранённое «Моё укрытие» ниже или выбрать точку на карте.</p>
          <Link className="btn" href={`/${slug}`}>Открыть карту</Link>
        </div>
      )}
      {pos && !data && !loadErr && <div className="alarm-wait"><Spinner size={22} />Загружаем список укрытий…</div>}
      {loadErr && !main && <div className="card alarm-card"><p><b>Нет данных об укрытиях</b></p><p className="note" style={{ margin: 0 }}>Откройте сервис при подключении к сети хотя бы один раз, чтобы список сохранился на устройстве.</p></div>}

      {main && (
        <section className="card alarm-main" aria-live="polite">
          <div className="alarm-tag">{main.mine ? <><Star size={14} />{main.type}</> : <><MapPin size={14} />Ближайшее укрытие</>}</div>
          <div className="alarm-row">
            <div className="alarm-dist">
              {Number.isFinite(main.dist) ? roundDist(Math.round(main.dist)) : "—"}
              <small>{walkMin ? `≈ ${walkMin} мин пешком` : "расстояние неизвестно"}</small>
            </div>
            {rel != null && (
              <div className="alarm-compass" aria-label={`Направление: ${cardinal(brg ?? 0)}`}>
                <Navigation2 size={72} style={{ transform: `rotate(${rel}deg)`, transition: "transform .25s" }} />
                <small>{compass.heading != null ? "по компасу" : cardinal(brg ?? 0)}</small>
              </div>
            )}
          </div>
          <h2 className="alarm-addr">{main.address}</h2>
          {main.holder && <p className="alarm-holder">{main.holder}</p>}
          <p className="note" style={{ margin: "2px 0 10px" }}>{main.type}{main.capacity ? ` · вместимость до ${main.capacity} чел.` : ""}{main.community ? " · добавлено жителями, не из официального списка" : ""}</p>
          {main.access && (
            <div className="alarm-acc">
              {main.access.stepFree && <span className={`tri ${main.access.stepFree}`}><Accessibility size={13} /> без ступеней: {main.access.stepFree === "yes" ? "да" : "нет"}</span>}
              {main.access.pets && <span className={`tri ${main.access.pets}`}><PawPrint size={13} /> с животными: {main.access.pets === "yes" ? "да" : "нет"}</span>}
              {main.access.hours && <span className="tri yes"><Clock4 size={13} /> {main.access.hours}</span>}
            </div>
          )}
          <Link href={goHref} className="primary go alarm-go"><Footprints size={24} />Пошли</Link>
          {ext && (
            <div className="ext-links" style={{ justifyContent: "center" }}>
              <a href={ext.ya} target="_blank" rel="noreferrer">Яндекс.Карты</a>
              <a href={ext.gis} target="_blank" rel="noreferrer">2ГИС</a>
            </div>
          )}
          <p className="note" style={{ textAlign: "center", margin: "8px 0 0" }}>
            {!online ? "Нет сети: маршрут в сервисе недоступен, ориентируйтесь по стрелке и расстоянию. " : ""}
            Точность позиции ≈ {pos ? Math.round(pos.acc) : "—"} м. Расстояние и направление по прямой.
          </p>
          {compass.needsTap && <button className="btn-plain" style={{ marginTop: 8 }} onClick={compass.enable}><Compass size={16} />Включить компас</button>}
        </section>
      )}

      {main && (
        <div className="alarm-filters">
          <button className={stepFree ? "fchip on" : "fchip"} aria-pressed={stepFree} onClick={() => setStepFree((v) => !v)}><Accessibility size={15} />Нужен вход без ступеней</button>
        </div>
      )}

      {myItems.length > 0 && (
        <section>
          <h3 className="alarm-h"><Star size={16} />Мои укрытия</h3>
          <ul className="list">
            {myItems.map((m) => (
              <li key={m.id}><button className={m.id === main?.id ? "row active" : "row"} onClick={() => setPicked(m.id)}>
                <span className="ico ico-green"><Star size={18} /></span>
                <span className="row-main"><b>{m.mine ? LABELS[m.mine.label] : ""}: {m.address}</b><small>{Number.isFinite(m.dist) ? roundDist(Math.round(m.dist)) : "—"}</small></span>
              </button></li>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h3 className="alarm-h"><Route size={16} />Другие рядом</h3>
          <ul className="list">
            {others.map((s) => (
              <li key={s.id}><button className="row" onClick={() => setPicked(s.id)}>
                <span className="ico ico-gray"><MapPin size={18} /></span>
                <span className="row-main"><b>{s.address}</b>{s.holder && <span>{s.holder}</span>}<small>{roundDist(Math.round(s.dist))}{s.capacity ? ` · до ${s.capacity} чел.` : ""}</small></span>
              </button></li>
            ))}
          </ul>
        </section>
      )}

      <Checklist autoOpen={false} />
      {data?.cached && <p className="note" style={{ textAlign: "center" }}>Список взят из сохранённой на устройстве копии.</p>}
    </main>
  );
}
