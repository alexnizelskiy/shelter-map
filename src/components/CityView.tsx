"use client";

import { useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { KIND_LABEL, distanceKm, type Shelter } from "@/lib/shelters";
import type { City } from "@/lib/cities";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false });

type Tab = "map" | "list" | "about";

export default function CityView({ city, shelters }: { city: City; shelters: Shelter[] }) {
  const [tab, setTab] = useState<Tab>("map");
  const [banner, setBanner] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const select = useCallback((id: string) => { setSelected(id); setTab("list"); }, []);

  const byDistance = useCallback(
    (pos: { lat: number; lng: number }) =>
      [...shelters].sort((a, b) => distanceKm(pos.lat, pos.lng, a.lat, a.lng) - distanceKm(pos.lat, pos.lng, b.lat, b.lng)),
    [shelters],
  );
  const sorted = useMemo(() => (me ? byDistance(me) : shelters), [me, byDistance, shelters]);
  const updated = shelters.map((s) => s.sourceCheckedAt).sort().at(-1);

  const locate = () => {
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(pos);
        const nearest = byDistance(pos)[0];
        if (nearest) { setSelected(nearest.id); setTab("list"); }
      },
      () => setGeoError(true),
    );
  };
  const zoom = (d: number) => window.dispatchEvent(new CustomEvent("map-zoom", { detail: d }));

  return (
    <div className="app">
      <CityMap center={city.center} zoom={city.zoom} shelters={shelters} selectedId={selected} onSelect={select} me={me} />

      {banner && (
        <header className="banner">
          <div>
            <h1>Где укрыться — {city.name}</h1>
            <p>
              {shelters.length > 0
                ? `${shelters.length} точек по официальному списку, проверено ${updated}.`
                : "Данные по городу загружаются."}{" "}
              Справочная информация, не гарантия безопасности.
            </p>
          </div>
          <button className="icon" aria-label="Закрыть" onClick={() => setBanner(false)}>×</button>
        </header>
      )}

      <section className={`sheet ${tab === "map" ? "sheet-hidden" : ""}`}>
        {tab === "list" && (
          <>
            {geoError && <p className="note">Не удалось определить местоположение. Выберите точку из списка.</p>}
            {sorted.length === 0 && <p className="note">Пока нет точек для показа.</p>}
            <ul className="list">
              {sorted.map((s) => (
                <li key={s.id}>
                  <button className={s.id === selected ? "item active" : "item"} onClick={() => setSelected(s.id)}>
                    <span className={`dot dot-${s.kind}`} />
                    <span className="item-body">
                      <strong>{s.address}</strong>
                      {s.landmark && <em>{s.landmark}</em>}
                      <small>
                        {KIND_LABEL[s.kind]}{s.capacity ? ` · до ${s.capacity} чел.` : ""}
                        {me ? ` · ${distanceKm(me.lat, me.lng, s.lat, s.lng).toFixed(1)} км` : ""}
                      </small>
                      <small>
                        <a href={s.sourceUrl} target="_blank" rel="noreferrer">Источник</a> · проверено {s.sourceCheckedAt}
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
            <p>Мы показываем только места из открытых официальных источников. У каждой точки указан источник и дата проверки.</p>
            <p>Информация не гарантирует безопасность и доступность входа. Следуйте оповещениям МЧС.</p>
          </div>
        )}
      </section>

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
