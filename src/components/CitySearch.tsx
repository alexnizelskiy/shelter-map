"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, MapPin, Search, X, Building2 } from "lucide-react";
import { usePref } from "@/lib/use-pref";
import { RowsSkeleton } from "./skeletons";

export type PlaceResult = { id: number; name: string; region: string; lat: number; lng: number; pop: number; slug: string; hasData: boolean };
type Recent = { slug: string; name: string; region: string };

export const CHOICE_KEY = "city-choice";

export function useRecent() {
  const [raw, setRaw] = usePref("recent-places", "[]");
  let list: Recent[] = [];
  try { list = JSON.parse(raw); } catch {}
  const add = (r: PlaceResult | Recent) => setRaw(JSON.stringify([{ slug: r.slug, name: r.name, region: r.region }, ...list.filter((x) => x.slug !== r.slug)].slice(0, 6)));
  return { list, add, clear: () => setRaw("[]") };
}

export default function CitySearch({ onClose, current, hideClose }: { onClose: () => void; current: string; hideClose?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ q: string; list: PlaceResult[] } | null>(null);
  const recent = useRecent();
  const [, setChoice] = usePref(CHOICE_KEY, "");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);

  const term = q.trim();
  const active = term.length >= 2;
  // результат относится к текущему запросу, иначе показываем «Ищем…» — без синхронных setState в эффекте
  const results = active && data?.q === term ? data.list : null;
  const loading = active && data?.q !== term;

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j) => setData({ q: term, list: j.results ?? [] }))
        .catch(() => {});
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [term]);

  const go = (r: { slug: string; name: string; region: string }) => {
    recent.add(r);
    setChoice(r.slug);
    onClose();
    if (r.slug !== current) router.push(`/${r.slug}`);
  };

  return (
    <div className="citysearch">
      <div className="cs-bar">
        <div className="field-input cs-input">
          <Search size={17} />
          <input ref={input} className="search" type="search" placeholder="Город, посёлок или село" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!hideClose && <button className="icon-btn big" aria-label="Закрыть поиск" onClick={onClose}><X size={20} /></button>}
      </div>

      {loading ? (
        <RowsSkeleton n={5} />
      ) : results === null ? (
        recent.list.length > 0 && (
          <>
            <div className="cs-head"><span>Вы недавно искали</span><button onClick={recent.clear}>Очистить</button></div>
            <ul className="list">
              {recent.list.map((r) => (
                <li key={r.slug}>
                  <button className="row" onClick={() => go(r)}>
                    <span className="ico ico-gray"><Clock size={18} /></span>
                    <span className="row-main"><b>{r.name}</b><span>{r.region}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      ) : (
        <>
          <p className="note">{results.length ? `Найдено: ${results.length}` : "Ничего не найдено. Проверьте написание."}</p>
          <ul className="list">
            {results.map((r) => (
              <li key={r.id}>
                <button className="row" onClick={() => go(r)}>
                  <span className={`ico ${r.hasData ? "ico-green" : "ico-gray"}`}>{r.hasData ? <Building2 size={18} /> : <MapPin size={18} />}</span>
                  <span className="row-main">
                    <b>{r.name}</b>
                    <span>{r.region}{r.pop > 0 ? ` · ${r.pop.toLocaleString("ru-RU")} чел.` : ""}</span>
                  </span>
                  {r.hasData && <span className="chip data">есть данные</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!loading && results === null && recent.list.length === 0 && <p className="note">Введите название — покажем карту этого места и укрытия, если они у нас есть.</p>}
    </div>
  );
}
