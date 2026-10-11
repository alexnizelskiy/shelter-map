"use client";

import { useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { KIND_LABEL, distanceKm, fmtDate, type Shelter } from "@/lib/shelters";
import type { City } from "@/lib/cities";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false });

type Tab = "map" | "list" | "about";
const LIST_LIMIT = 100;
const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

const title = (s: Shelter) => `${s.objectType}${s.placement ? ` в ${s.placement}` : ""}`;

export default function CityView({ city, shelters }: { city: City; shelters: Shelter[] }) {
  const [tab, setTab] = useState<Tab>("map");
  const [banner, setBanner] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);

  const pick = useCallback((id: string) => { setSelected(id); }, []);
  const pickFromList = (id: string) => { setSelected(id); if (isNarrow()) setTab("map"); };

  const byDistance = useCallback(
    (pos: { lat: number; lng: number }) =>
      [...shelters].sort((a, b) => distanceKm(pos.lat, pos.lng, a.lat, a.lng) - distanceKm(pos.lat, pos.lng, b.lat, b.lng)),
    [shelters],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = me ? byDistance(me) : shelters;
    const found = q ? base.filter((s) => `${s.address} ${s.holder ?? ""}`.toLowerCase().includes(q)) : base;
    return { total: found.length, items: found.slice(0, LIST_LIMIT) };
  }, [query, me, byDistance, shelters]);

  const current = shelters.find((s) => s.id === selected) ?? null;
  const updated = shelters.map((s) => s.sourceUpdatedAt).sort().at(-1);
  const totalCapacity = useMemo(() => shelters.reduce((a, s) => a + (s.capacity ?? 0), 0), [shelters]);

  const locate = () => {
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(pos);
        const nearest = byDistance(pos)[0];
        if (nearest) { setSelected(nearest.id); setTab("map"); }
      },
      () => setGeoError(true),
    );
  };
  const zoom = (d: number) => window.dispatchEvent(new CustomEvent("map-zoom", { detail: d }));

  return (
    <div className="app">
      <CityMap center={city.center} zoom={city.zoom} shelters={shelters} selectedId={selected} onSelect={pick} me={me} />

      {banner && (
        <header className="banner">
          <div>
            <h1>Где укрыться — {city.name}</h1>
            <p>
              {shelters.length > 0
                ? `${shelters.length} защитных помещений по списку администрации города, данные источника от ${fmtDate(updated!)}. `
                : "Данные по городу загружаются. "}
              Справочная информация, не гарантия безопасности и доступности входа.
            </p>
          </div>
          <button className="icon" aria-label="Закрыть" onClick={() => setBanner(false)}>×</button>
        </header>
      )}

      <section className={`sheet ${tab === "map" ? "sheet-hidden" : ""}`}>
        {tab === "list" && (
          <>
            <input className="search" type="search" placeholder="Поиск по адресу или организации" value={query} onChange={(e) => setQuery(e.target.value)} />
            {geoError && <p className="note">Не удалось определить местоположение. Выберите точку из списка.</p>}
            <p className="note">
              {visible.total === 0 ? "Ничего не найдено." : `Найдено: ${visible.total}${visible.total > LIST_LIMIT ? `, показаны первые ${LIST_LIMIT}` : ""}${me ? ", по удалённости" : ""}`}
            </p>
            <ul className="list">
              {visible.items.map((s) => (
                <li key={s.id}>
                  <button className={s.id === selected ? "item active" : "item"} onClick={() => pickFromList(s.id)}>
                    <span className={`dot dot-${s.kind}`} />
                    <span className="item-body">
                      <strong>{s.address}</strong>
                      {s.holder && <em>{s.holder}</em>}
                      <small>
                        {title(s)}{s.capacity ? ` · вместимость ${s.capacity} чел.` : ""}
                        {me ? ` · ${distanceKm(me.lat, me.lng, s.lat, s.lng).toFixed(1)} км` : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "about" && (
          <div className="about">
            <h2>О сервисе</h2>
            <p>Мы показываем только места из открытых официальных источников. У каждой точки указан источник и дата данных.</p>
            <p>Суммарная вместимость по списку: {totalCapacity.toLocaleString("ru-RU")} чел. Это заявленные источником значения, а не гарантия свободных мест.</p>
            <p>Информация не гарантирует безопасность и доступность входа. Следуйте оповещениям МЧС.</p>
          </div>
        )}
      </section>

      {current && <Passport s={current} me={me} onClose={() => setSelected(null)} hideOnNarrow={tab !== "map"} />}

      <div className="fabs">
        <button className="fab" aria-label="Приблизить" onClick={() => zoom(1)}>+</button>
        <button className="fab" aria-label="Отдалить" onClick={() => zoom(-1)}>−</button>
        <button className="fab fab-accent" aria-label="Найти ближайшее" onClick={locate}>◎</button>
      </div>

      <nav className="tabs" aria-label="Разделы">
        {([["list", "Список"], ["map", "Карта"], ["about", "О сервисе"]] as const).map(([k, label]) => (
          <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

function Passport({ s, me, onClose, hideOnNarrow }: { s: Shelter; me: { lat: number; lng: number } | null; onClose: () => void; hideOnNarrow: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ["Тип объекта", s.objectType],
    ...(s.placement ? ([["Расположение", `в ${s.placement}`]] as [string, string][]) : []),
    ["Адрес", s.address],
    ...(s.holder ? ([["Организация / ориентир", s.holder]] as [string, string][]) : []),
    ["Вместимость", s.capacity ? `${s.capacity.toLocaleString("ru-RU")} чел.` : "не указана"],
    ["Категория", KIND_LABEL[s.kind]],
    ...(me ? ([["Расстояние", `${distanceKm(me.lat, me.lng, s.lat, s.lng).toFixed(1)} км`]] as [string, string][]) : []),
    ["Источник", <a key="src" href={s.sourceUrl} target="_blank" rel="noreferrer">Карта администрации города</a>],
    ["Данные источника от", fmtDate(s.sourceUpdatedAt)],
    ["Сверено нами", fmtDate(s.sourceCheckedAt)],
  ];
  return (
    <aside className={`passport ${hideOnNarrow ? "passport-hide" : ""}`}>
      <div className="passport-head">
        <h2>Паспорт укрытия</h2>
        <button className="icon" aria-label="Закрыть" onClick={onClose}>×</button>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="row"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <div className="routes">
        <a className="btn" target="_blank" rel="noreferrer" href={`https://yandex.ru/maps/?rtext=~${s.lat},${s.lng}&rtt=pd`}>Маршрут в Яндекс.Картах</a>
        <a className="btn btn-ghost" target="_blank" rel="noreferrer" href={`https://2gis.ru/routeSearch/rsType/pedestrian/to/${s.lng},${s.lat}`}>2ГИС</a>
      </div>
      <p className="note">Данные взяты из списка администрации и могут устареть. Вместимость и доступность входа не гарантируются.</p>
    </aside>
  );
}
