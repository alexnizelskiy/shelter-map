"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Building2, CalendarDays, ChevronRight, CircleAlert, DoorClosed, DoorOpen, Heart, Layers, LayoutGrid, Link2, List, LocateFixed,
  Map as MapIcon, MapPin, MapPinPlus, Minus, Navigation, Palette, Plus, Route, Search, SearchX, Settings, ShieldCheck, TriangleAlert,
  Users, X, Clock, Info, Car, Footprints, ListOrdered, type LucideIcon,
} from "lucide-react";
import { KIND_LABEL, distanceKm, fmtDate, type Shelter } from "@/lib/shelters";
import type { City } from "@/lib/cities";
import { REPORT_KINDS, REPORT_LABEL, REPORT_TTL_HOURS, WARN_THRESHOLD, flaggedIds, type ReportKind, type ReportSummary } from "@/lib/reports";
import SuggestForm, { EMPTY_DRAFT, type Draft } from "./SuggestForm";
import ThemeSwitch from "./ThemeSwitch";
import BasemapSwitch, { useBasemapId } from "./BasemapSwitch";
import { getBasemap } from "@/lib/basemaps";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false });

type Tab = "map" | "list" | "suggest" | "settings";
const LIST_LIMIT = 100;
const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: "map", label: "Карта", Icon: MapIcon },
  { key: "list", label: "Список", Icon: List },
  { key: "suggest", label: "Предложить", Icon: MapPinPlus },
  { key: "settings", label: "Настройки", Icon: Settings },
];

const REPORT_ICON: Record<ReportKind, LucideIcon> = { open: DoorOpen, closed: DoorClosed, not_found: SearchX, wrong_info: CircleAlert };

export type RouteInfo = { mode: "foot" | "car"; distance: number; duration: number; coords: [number, number][]; steps: { text: string; distance: number }[] };
const fmtDist = (m: number) => (m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1).replace(".", ",")} км`);
const fmtTime = (sec: number) => {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60 ? `${min % 60} мин` : ""}`.trim();
};

const title = (s: Shelter) => `${s.objectType}${s.placement ? ` в ${s.placement}` : ""}`;
const iconFor = (s: Shelter): { Icon: LucideIcon; cls: string } =>
  s.origin === "community"
    ? s.kind === "help_point" ? { Icon: Heart, cls: "ico-blue" } : { Icon: MapPin, cls: "ico-gray" }
    : { Icon: ShieldCheck, cls: "ico-green" };

export default function CityView({ city, shelters }: { city: City; shelters: Shelter[] }) {
  const [tab, setTab] = useState<Tab>("map");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [picking, setPicking] = useState(false);
  const [bmId] = useBasemapId();
  const basemap = getBasemap(bmId);
  const [layersOpen, setLayersOpen] = useState(false);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const loadReports = useCallback(() => {
    fetch(`/api/reports?city=${city.slug}`)
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((j) => setReports(j.reports ?? []))
      .catch(() => {});
  }, [city.slug]);
  useEffect(() => { loadReports(); }, [loadReports]);

  const flagged = useMemo(() => flaggedIds(reports), [reports]);
  const currentReport = reports.find((r) => r.shelterId === selected) ?? null;

  const onMapPick = useCallback((lat: number, lng: number) => {
    setDraft((d) => ({ ...d, lat, lng }));
    setPicking(false);
    setTab("suggest");
  }, []);

  const pick = useCallback((id: string) => { setSelected(id); setRoute(null); setRouteError(null); }, []);
  const pickFromList = (id: string) => { setSelected(id); setRoute(null); setRouteError(null); if (isNarrow()) setTab("map"); };

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
  const official = useMemo(() => shelters.filter((s) => s.origin !== "community"), [shelters]);
  const updated = official.map((s) => s.sourceUpdatedAt).sort().at(-1);
  const totalCapacity = useMemo(() => official.reduce((a, s) => a + (s.capacity ?? 0), 0), [official]);

  const locate = () => {
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(pos);
        const nearest = byDistance(pos)[0];
        if (nearest) { setSelected(nearest.id); setTab("map"); }
      },
      () => { setGeoError(true); setTab("map"); },
    );
  };
  const buildRoute = (target: Shelter, mode: "foot" | "car") => {
    setRouteError(null);
    setRouteBusy(true);
    const go = async (pos: { lat: number; lng: number }) => {
      try {
        const r = await fetch(`/api/route?from=${pos.lng},${pos.lat}&to=${target.lng},${target.lat}&mode=${mode}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Не удалось построить маршрут");
        setMe(pos);
        setRoute(j);
      } catch (e) {
        setRouteError(e instanceof Error ? e.message : "Не удалось построить маршрут");
      } finally {
        setRouteBusy(false);
      }
    };
    if (me) return void go(me);
    navigator.geolocation.getCurrentPosition(
      (p) => go({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setRouteBusy(false); setRouteError("Не удалось определить ваше местоположение. Разрешите доступ к геопозиции."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const zoom = (d: number) => window.dispatchEvent(new CustomEvent("map-zoom", { detail: d }));

  return (
    <div className="app">
      <CityMap
        center={city.center} zoom={city.zoom} shelters={shelters} selectedId={selected} onSelect={pick} me={me} flagged={flagged}
        picking={picking} picked={draft.lat != null && draft.lng != null ? { lat: draft.lat, lng: draft.lng } : null} onPick={onMapPick}
        basemap={basemap} route={route?.coords ?? null}
      />

      {picking && (
        <div className="pick-hint glass">
          <MapPin size={18} /> Нажмите на карте место, которое хотите предложить
          <button onClick={() => { setPicking(false); setTab("suggest"); }}>Отмена</button>
        </div>
      )}

      <aside className="side">
        <section className={`panel glass`} data-tab={tab}>
          {tab === "map" && (
            <>
              <div className="large-title">
                <h1>Где укрыться</h1>
                <span className="chip-city"><MapPin size={14} />{city.name}</span>
              </div>
              <button className="primary" onClick={locate}><Navigation size={18} />Найти ближайшее</button>
              {geoError && <p className="note">Не удалось определить местоположение. Откройте список и выберите точку вручную.</p>}
              <div className="stats">
                <div className="card stat">
                  <span className="ico ico-green"><Building2 size={18} /></span>
                  <b>{official.length.toLocaleString("ru-RU")}</b>
                  <span>помещений в списке города</span>
                </div>
                <div className="card stat">
                  <span className="ico ico-blue"><Users size={18} /></span>
                  <b>{totalCapacity >= 1e6 ? `${(totalCapacity / 1e6).toFixed(2).replace(".", ",")} млн` : totalCapacity.toLocaleString("ru-RU")}</b>
                  <span>заявленная вместимость</span>
                </div>
              </div>
              <div className="card group">
                <div className="group-row">
                  <span className="ico ico-gray"><Clock size={16} /></span>
                  <div>Данные администрации от {updated ? fmtDate(updated) : "—"}<small>Источник и дата указаны в паспорте каждой точки</small></div>
                </div>
                <div className="group-row">
                  <span className="ico ico-amber"><TriangleAlert size={16} /></span>
                  <div>Справочная информация<small>Не гарантия безопасности и доступности входа. Следуйте оповещениям МЧС.</small></div>
                </div>
              </div>
              <div className="card legend">
                <div><i style={{ background: "#16a34a" }} />Защитное помещение (список администрации)</div>
                <div><i style={{ background: "#2f7cf6" }} />Пункт помощи</div>
                <div><i style={{ background: "#8b93a1" }} />Добавлено жителями, не подтверждено официально</div>
                <div><i style={{ background: "#d99a00" }} />Жители сообщают о проблеме со входом</div>
              </div>
            </>
          )}

          {tab === "list" && (
            <>
              <div className="large-title"><h2>Список</h2><span className="chip-city"><LayoutGrid size={14} />{visible.total}</span></div>
              <div className="field-input">
                <Search size={17} />
                <input className="search" type="search" placeholder="Адрес или организация" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <p className="note">
                {visible.total === 0 ? "Ничего не найдено." : `${visible.total > LIST_LIMIT ? `Показаны первые ${LIST_LIMIT}` : "Найдено"}${me ? " · по удалённости" : ""}`}
              </p>
              <ul className="list">
                {visible.items.map((s) => {
                  const { Icon, cls } = iconFor(s);
                  return (
                    <li key={s.id}>
                      <button className={s.id === selected ? "row active" : "row"} onClick={() => pickFromList(s.id)}>
                        <span className={`ico ${flagged.includes(s.id) ? "ico-amber" : cls}`}>{flagged.includes(s.id) ? <TriangleAlert size={18} /> : <Icon size={18} />}</span>
                        <span className="row-main">
                          <b>{s.address}</b>
                          {s.holder && <span>{s.holder}</span>}
                          <small>
                            {s.capacity ? `до ${s.capacity} чел.` : title(s)}
                            {me ? ` · ${distanceKm(me.lat, me.lng, s.lat, s.lng).toFixed(1)} км` : ""}
                          </small>
                        </span>
                        <ChevronRight size={18} className="chev" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === "suggest" && (
            <SuggestForm citySlug={city.slug} draft={draft} setDraft={setDraft} onPickOnMap={() => { setPicking(true); setTab("map"); }} />
          )}

          {tab === "settings" && (
            <div className="about">
              <div className="large-title"><h2>Настройки</h2></div>
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Palette size={16} />Оформление</h2>
              <ThemeSwitch />
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><MapIcon size={16} />Подложка карты</h2>
              <BasemapSwitch />
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Info size={16} />О сервисе</h2>
              <div className="card" style={{ padding: "6px 10px" }}>
                <p>Мы показываем только места из открытых официальных источников. У каждой точки указан источник и дата данных.</p>
                <p>Заявки жителей проверяет модератор. Сообщения о входе («открыт / закрыт») не меняют официальный статус и устаревают через {REPORT_TTL_HOURS} ч.</p>
                <p>Информация не гарантирует безопасность и доступность входа. Следуйте оповещениям МЧС.</p>
              </div>
            </div>
          )}
        </section>

        <nav className="dock glass" aria-label="Разделы">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} className={tab === key ? "dock-tab on" : "dock-tab"} onClick={() => setTab(key)} aria-current={tab === key}>
              <Icon size={21} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {current && !picking && (
        <Passport key={current.id} citySlug={city.slug} route={route} routeBusy={routeBusy} routeError={routeError} onRoute={(m) => buildRoute(current, m)} onClearRoute={() => { setRoute(null); setRouteError(null); }} s={current} me={me} summary={currentReport} onSent={loadReports} onClose={() => setSelected(null)} hideOnNarrow={tab !== "map"} />
      )}

      {layersOpen && <div className="layers-pop glass"><BasemapSwitch compact /></div>}
      <div className="controls">
        <button className="ctl-btn glass" aria-label="Подложка карты" aria-expanded={layersOpen} onClick={() => setLayersOpen((v) => !v)}><Layers size={21} /></button>
        <div className="zoom glass">
          <button aria-label="Приблизить" onClick={() => zoom(1)}><Plus size={20} /></button>
          <button aria-label="Отдалить" onClick={() => zoom(-1)}><Minus size={20} /></button>
        </div>
        <button className="locate" aria-label="Найти ближайшее" onClick={locate}><LocateFixed size={22} /></button>
      </div>
    </div>
  );
}

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  return `${Math.floor(min / 60)} ч назад`;
};

type PRow = { Icon: LucideIcon; label: string; value: React.ReactNode };

function Passport({ citySlug, route, routeBusy, routeError, onRoute, onClearRoute, s, me, summary, onSent, onClose, hideOnNarrow }: { citySlug: string; route: RouteInfo | null; routeBusy: boolean; routeError: string | null; onRoute: (m: "foot" | "car") => void; onClearRoute: () => void; s: Shelter; me: { lat: number; lng: number } | null; summary: ReportSummary | null; onSent: () => void; onClose: () => void; hideOnNarrow: boolean }) {
  const [sent, setSent] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (kind: ReportKind) => {
    setBusy(true);
    try {
      const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: citySlug, shelterId: s.id, kind }) });
      const j = await r.json().catch(() => ({}));
      setSent(r.ok ? { ok: true, text: "Спасибо, сообщение принято." } : { ok: false, text: j.error ?? "Не удалось отправить." });
      if (r.ok) onSent();
    } catch {
      setSent({ ok: false, text: "Нет соединения. Попробуйте позже." });
    } finally {
      setBusy(false);
    }
  };
  const warn = summary && summary.problems6h >= WARN_THRESHOLD;
  const { Icon: HeadIcon, cls } = iconFor(s);

  const rows: PRow[] = [
    { Icon: Layers, label: "Тип объекта", value: title(s) },
    ...(s.holder ? [{ Icon: Building2, label: "Организация / ориентир", value: s.holder }] : []),
    { Icon: Users, label: "Вместимость", value: s.capacity ? `${s.capacity.toLocaleString("ru-RU")} чел.` : "не указана" },
    { Icon: ShieldCheck, label: "Категория", value: KIND_LABEL[s.kind] },
    ...(me ? [{ Icon: Navigation, label: "Расстояние", value: `${distanceKm(me.lat, me.lng, s.lat, s.lng).toFixed(1)} км` }] : []),
    {
      Icon: Link2, label: "Источник",
      value: s.origin === "community"
        ? "Заявка жителя, проверена модератором. Не из официального списка."
        : s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer">{s.sourceUrl.includes("yandex.ru/maps") ? "Карта администрации города" : "Открыть источник"}</a> : "Указан администратором",
    },
    { Icon: CalendarDays, label: s.origin === "community" ? "Добавлено" : "Данные источника от", value: fmtDate(s.sourceUpdatedAt) },
    ...(s.origin === "community" ? [] : [{ Icon: CalendarDays, label: "Сверено нами", value: fmtDate(s.sourceCheckedAt) }]),
  ];

  return (
    <aside className={`passport glass ${hideOnNarrow ? "passport-hide" : ""}`}>
      <div className="passport-head">
        <span className={`ico ${cls}`}><HeadIcon size={20} /></span>
        <h2>Паспорт укрытия</h2>
        <button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={18} /></button>
      </div>
      <p className="passport-addr">{s.address}</p>

      <dl className="card rows">
        {rows.map(({ Icon, label, value }) => (
          <div key={label} className="group-row">
            <span className="ico ico-gray"><Icon size={16} /></span>
            <div><dt>{label}</dt><dd>{value}</dd></div>
          </div>
        ))}
      </dl>

      <div className="card route-card">
        <h3><Route size={16} />Маршрут</h3>
        {!route && (
          <div className="route-btns">
            <button className="btn" disabled={routeBusy} onClick={() => onRoute("foot")}><Footprints size={18} />{routeBusy ? "Строим…" : "Пешком"}</button>
            <button className="btn btn-ghost-wide" disabled={routeBusy} onClick={() => onRoute("car")}><Car size={18} />На машине</button>
          </div>
        )}
        {routeError && <p className="err">{routeError}</p>}
        {route && (
          <>
            <div className="route-sum">
              <span className="ico ico-blue">{route.mode === "foot" ? <Footprints size={18} /> : <Car size={18} />}</span>
              <div><b>{fmtDist(route.distance)} · {fmtTime(route.duration)}</b><small>{route.mode === "foot" ? "пешком" : "на машине"}, оценка по открытым данным OSM</small></div>
              <button className="icon-btn" aria-label="Сбросить маршрут" onClick={onClearRoute}><X size={18} /></button>
            </div>
            <details className="steps">
              <summary><ListOrdered size={15} />Пошаговый маршрут ({route.steps.length})</summary>
              <ol>{route.steps.map((st, i) => <li key={i}>{st.text}{st.distance > 0 && <small> · {fmtDist(st.distance)}</small>}</li>)}</ol>
            </details>
            <div className="route-btns">
              <button className="btn btn-ghost-wide" onClick={() => onRoute(route.mode === "foot" ? "car" : "foot")}>{route.mode === "foot" ? <><Car size={16} />На машине</> : <><Footprints size={16} />Пешком</>}</button>
            </div>
          </>
        )}
        <div className="ext-links">
          <a target="_blank" rel="noreferrer" href={`https://yandex.ru/maps/?rtext=~${s.lat},${s.lng}&rtt=pd`}>Открыть в Яндекс.Картах</a>
          <a target="_blank" rel="noreferrer" href={`https://2gis.ru/routeSearch/rsType/pedestrian/to/${s.lng},${s.lat}`}>2ГИС</a>
        </div>
        <p className="note" style={{ margin: "6px 0 0" }}>Маршрут ориентировочный: проверяйте обстановку и следуйте указаниям МЧС.</p>
      </div>

      <div className="card reports">
        <h3><Users size={16} />Сообщения жителей</h3>
        {warn && <p className="warn"><TriangleAlert size={16} style={{ flex: "none" }} />Жители сообщают о проблеме со входом. Это не подтверждено, будьте внимательны.</p>}
        {summary ? (
          <ul className="rep-list">
            {REPORT_KINDS.filter((k) => summary[k] > 0).map((k) => <li key={k}>{REPORT_LABEL[k]}: {summary[k]}</li>)}
            <li className="note" style={{ margin: 0 }}>Последнее: «{REPORT_LABEL[summary.lastKind]}», {ago(summary.lastAt)}. Учитываются сообщения за {REPORT_TTL_HOURS} ч; актуальность не гарантируется.</li>
          </ul>
        ) : (
          <p className="note" style={{ marginLeft: 0 }}>За последние {REPORT_TTL_HOURS} ч сообщений нет. Состояние входа не подтверждено.</p>
        )}
        <div className="rep-btns">
          {REPORT_KINDS.map((k) => {
            const I = REPORT_ICON[k];
            return <button key={k} disabled={busy} onClick={() => send(k)}><I size={18} />{REPORT_LABEL[k]}</button>;
          })}
        </div>
        {sent && <p className={sent.ok ? "ok" : "err"}>{sent.text}</p>}
        <p className="note" style={{ marginLeft: 0 }}>Сообщайте только то, что заметили сами. Не подвергайте себя опасности ради проверки.</p>
      </div>

      <p className="note">
        {s.origin === "community" ? "Точка добавлена по сообщению жителя и не подтверждена официальным источником." : "Данные взяты из списка администрации и могут устареть."} Вместимость и доступность входа не гарантируются.
      </p>
    </aside>
  );
}
