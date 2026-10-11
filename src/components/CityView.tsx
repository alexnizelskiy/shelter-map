"use client";

import { useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { KIND_LABEL, distanceKm, type Shelter } from "@/lib/shelters";
import type { City } from "@/lib/cities";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false });

export default function CityView({ city, shelters }: { city: City; shelters: Shelter[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const select = useCallback((id: string) => setSelected(id), []);

  const sorted = useMemo(() => {
    if (!me) return shelters;
    return [...shelters].sort(
      (a, b) => distanceKm(me.lat, me.lng, a.lat, a.lng) - distanceKm(me.lat, me.lng, b.lat, b.lng),
    );
  }, [shelters, me]);

  const locate = () => {
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(pos);
        const nearest = [...shelters].sort(
          (a, b) => distanceKm(pos.lat, pos.lng, a.lat, a.lng) - distanceKm(pos.lat, pos.lng, b.lat, b.lng),
        )[0];
        if (nearest) setSelected(nearest.id);
      },
      () => setGeoError(true),
    );
  };

  return (
    <div className="layout">
      <aside className="panel">
        <h1>Укрытия — {city.name}</h1>
        <button className="primary" onClick={locate}>Найти ближайшее</button>
        {geoError && <p className="note">Не удалось определить местоположение. Выберите точку из списка.</p>}
        <p className="note">
          Информация носит справочный характер и не гарантирует безопасность. Следуйте оповещениям МЧС.
        </p>
        {sorted.length === 0 && <p className="empty">Данные для города загружаются.</p>}
        <ul className="list">
          {sorted.map((s) => (
            <li key={s.id}>
              <button className={s.id === selected ? "item active" : "item"} onClick={() => setSelected(s.id)}>
                <strong>{s.address}</strong>
                {s.landmark && <span>{s.landmark}</span>}
                <span>{KIND_LABEL[s.kind]}{s.capacity ? ` · до ${s.capacity} чел.` : ""}</span>
                {me && <span>{distanceKm(me.lat, me.lng, s.lat, s.lng).toFixed(1)} км</span>}
                <span className="src">
                  <a href={s.sourceUrl} target="_blank" rel="noreferrer">Источник</a>, проверено {s.sourceCheckedAt}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <CityMap center={city.center} zoom={city.zoom} shelters={shelters} selectedId={selected} onSelect={select} />
    </div>
  );
}
