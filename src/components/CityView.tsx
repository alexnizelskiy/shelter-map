"use client";

import { memo, startTransition, useSyncExternalStore, useEffect, useMemo, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2, CalendarDays, ChevronRight, CircleAlert, DoorClosed, DoorOpen, Heart, Layers, LayoutGrid, Link2, List, LocateFixed,
  Map as MapIcon, MapPin, MapPinPlus, Minus, Navigation, Palette, Plus, Route, Search, SearchX, Settings, ShieldCheck, Radar, TriangleAlert,
  Users, X, Clock, Ruler, Info, ChevronDown, Car, Camera, Smartphone, WifiOff, Siren, Accessibility, PawPrint, MessageCircle, Volume2, VolumeX, ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Undo2, RotateCw, Flag, Footprints, ListOrdered, type LucideIcon,
} from "lucide-react";
import { compressImage } from "@/lib/image";
import { KIND_LABEL, distanceKm, fmtDate, type MapPoints, type Shelter } from "@/lib/shelters";
import { cityAt } from "@/lib/map-city";
import type { City } from "@/lib/cities";
import { REPORT_KINDS, REPORT_LABEL, REPORT_TTL_HOURS, WARN_THRESHOLD, flaggedIds, type ReportKind, type ReportSummary } from "@/lib/reports";
import SuggestForm, { EMPTY_DRAFT, type Draft } from "./SuggestForm";
import ThemeSwitch from "./ThemeSwitch";
import AccessibilitySettings from "./AccessibilitySettings";
import CitySearch from "./CitySearch";
import LocationPrompt from "./LocationPrompt";
import Checklist from "./Checklist";
import AccessBlock from "./AccessBlock";
import MyShelterButton from "./MyShelterButton";
import OfflineSettings from "./OfflineSettings";
import ChatPanel from "./ChatPanel";
import RadarPanel from "./RadarPanel";
import { PushSettings } from "./PushControl";
import ContactBlock from "./ContactBlock";
import { DocsView, FaqView, HelpView, ProfileLinks, type SubView } from "./ProfileViews";
import { bumpHelp } from "@/lib/my-help";
import Spinner from "./Spinner";
import BrandLogo from "./BrandLogo";
import { useNavigation, type NavState, type Variant } from "@/lib/useNavigation";
import { formatClock, roundDist, type LngLat, type NavStep } from "@/lib/nav";
import BasemapSwitch, { useBasemapId } from "./BasemapSwitch";
import { getBasemap } from "@/lib/basemaps";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false, loading: () => <div className="map-skel" aria-hidden="true" /> });

type Tab = "map" | "list" | "radar" | "chat" | "suggest" | "settings";
const TAB_KEY = "opora-tab";
let tabRestored = false; // возвращаем раздел только при первом показе после загрузки страницы, а не при переходах между городами
const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: "map", label: "Карта", Icon: MapIcon },
  { key: "list", label: "Список", Icon: List },
  { key: "radar", label: "Радар", Icon: Radar },
  { key: "chat", label: "Чат", Icon: MessageCircle },
  { key: "suggest", label: "Добавить", Icon: MapPinPlus },
  { key: "settings", label: "Настройки", Icon: Settings },
];

const REPORT_ICON: Record<ReportKind, LucideIcon> = { open: DoorOpen, closed: DoorClosed, not_found: SearchX, wrong_info: CircleAlert };

export type RouteInfo = { mode: "foot" | "car"; variants: Variant[]; at: number };

function ManeuverIcon({ step, size }: { step: NavStep | null; size: number }) {
  const props = { size, strokeWidth: 2.4 };
  if (!step) return <ArrowUp {...props} />;
  if (step.type === "arrive") return <Flag {...props} />;
  if (step.type.includes("roundabout") || step.type === "rotary") return <RotateCw {...props} />;
  switch (step.modifier) {
    case "left": case "sharp left": return <CornerUpLeft {...props} />;
    case "right": case "sharp right": return <CornerUpRight {...props} />;
    case "slight left": return <ArrowUpLeft {...props} />;
    case "slight right": return <ArrowUpRight {...props} />;
    case "uturn": return <Undo2 {...props} />;
    default: return <ArrowUp {...props} />;
  }
}
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

// Строка списка. memo: при выборе точки перерисовываются только две строки, а не все 1400.
const ShelterRow = memo(function ShelterRow({ s, active, warn, dist, onPick }: { s: Shelter; active: boolean; warn: boolean; dist: number | null; onPick: (id: string) => void }) {
  const { Icon, cls } = iconFor(s);
  return (
    <li>
      <button className={active ? "row active" : "row"} onClick={() => onPick(s.id)}>
        <span className={`ico ${warn ? "ico-amber" : cls}`}>{warn ? <TriangleAlert size={18} /> : <Icon size={18} />}</span>
        <span className="row-main">
          <b>{s.address}</b>
          {s.holder && <span>{s.holder}</span>}
          <small>
            {s.capacity ? `до ${s.capacity} чел.` : title(s)}
            {dist != null ? ` · ${dist.toFixed(1)} км` : ""}
          </small>
        </span>
        <ChevronRight size={18} className="chev" />
      </button>
    </li>
  );
});

export default function CityView({ city: city0, shelters: shelters0 }: { city: City; shelters: Shelter[] }) {
  // Текущий город «живой»: если карту переместили в область другого города, он подгружается и становится текущим (см. onViewChange).
  // Пока ничего не менялось, берём данные страницы: они обновляются тихо, после открытия из копии.
  const [switched, setSwitched] = useState<{ city: City; shelters: Shelter[] } | null>(null);
  const city = switched?.city ?? city0;
  const shelters = switched?.shelters ?? shelters0;
  const [tab, setTab] = useState<Tab>("map");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fStep, setFStep] = useState(false);
  const [fPets, setFPets] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [picking, setPicking] = useState(false);
  const online = useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );
  const [bmId] = useBasemapId();
  const basemap = getBasemap(bmId);
  const [layersOpen, setLayersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sub, setSub] = useState<SubView | null>(null); // вложенный экран настроек: Частые вопросы, Документы, Ваша помощь
  if (tab !== "settings" && sub) setSub(null);
  const [infoOpen, setInfoOpen] = useState(false); // «О карте»: на телефоне открывается разделом на весь экран, как на компьютере
  const sheetOpen = searchOpen || infoOpen || tab !== "map"; // на телефоне такие разделы открываются почти на весь экран
  const [chatSeen, setChatSeen] = useState(false); // чат, однажды открытый, остаётся в памяти: при возврате не грузится заново
  if (tab === "chat" && !chatSeen) setChatSeen(true);
  // направление анимации переключения разделов (как в Telegram): новый раздел въезжает справа, если он правее прежнего, иначе слева
  const [prevTab, setPrevTab] = useState<Tab>(tab);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  if (tab !== prevTab) { setDir(TABS.findIndex((x) => x.key === tab) > TABS.findIndex((x) => x.key === prevTab) ? "fwd" : "back"); setPrevTab(tab); }
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [variantIdx, setVariantIdx] = useState(0);
  const [navActive, setNavActive] = useState(false);
  const [follow, setFollow] = useState(true);
  const [voice, setVoice] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // после входа через внешний сервис открываем чат (?chat=1), по нажатию на уведомление — «Радар» (?radar=1);
  // при обновлении страницы возвращаемся в тот раздел, где были (запоминается на время вкладки)
  useEffect(() => {
    const q = window.location.search;
    let target: Tab | null = null;
    let targetSub: SubView | null = null;
    if (q.includes("chat=1") || q.includes("radar=1")) target = q.includes("radar=1") ? "radar" : "chat";
    else if (!tabRestored) {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav?.type === "reload" || nav?.type === "back_forward") {
        try {
          const saved = JSON.parse(sessionStorage.getItem(TAB_KEY) ?? "null") as { tab?: string; sub?: string } | null;
          if (saved && TABS.some((x) => x.key === saved.tab)) target = saved.tab as Tab;
          if (saved?.sub === "faq" || saved?.sub === "docs" || saved?.sub === "stats") targetSub = saved.sub;
        } catch { /* хранилище недоступно */ }
      }
    }
    tabRestored = true;
    if (!target || target === "map") return;
    const t = setTimeout(() => { setTab(target); if (target === "settings" && targetSub) setSub(targetSub); }, 0);
    return () => clearTimeout(t);
  }, []);
  // запоминаем текущий раздел (и вложенный экран настроек)
  useEffect(() => {
    if (!tabRestored) return;
    try { sessionStorage.setItem(TAB_KEY, JSON.stringify({ tab, sub: tab === "settings" ? sub : null })); } catch { /* приватный режим */ }
  }, [tab, sub]);

  // Страница открылась сразу из сохранённой копии (service worker): тихо подтягиваем свежие данные, не перезагружая интерфейс
  const router = useRouter();
  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav?.serverTiming?.some((x) => x.name === "sw-cache") || !navigator.onLine) return;
    const t = setTimeout(() => startTransition(() => router.refresh()), 1200);
    return () => clearTimeout(t);
  }, [router]);

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

  // ───── карта и города ─────
  // Фоновый слой: точки всех городов (≈150 КБ, грузятся один раз в фоне). При отдалении видны все объекты системы.
  const [pts, setPts] = useState<MapPoints | null>(null);
  const ptsRef = useRef<MapPoints | null>(null);
  useEffect(() => { ptsRef.current = pts; }, [pts]);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/map-points").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setPts(j as MapPoints); }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  const others = useMemo(
    () => (pts ? pts.p.filter((x) => pts.slugs[x[4]] !== city.slug).map((x) => ({ id: x[0], lat: x[1], lng: x[2], kind: pts.k[x[3]] })) : []),
    [pts, city.slug],
  );

  const wanted = useRef("");
  const switchTo = useCallback(async (slug: string, selectId?: string) => {
    if (slug === city.slug) { if (selectId) setSelected(selectId); return; }
    wanted.current = slug;
    let next: { city: City; shelters: Shelter[] } | null = null;
    if (slug !== city0.slug) {
      try {
        const r = await fetch(`/api/city-data?slug=${encodeURIComponent(slug)}`);
        if (!r.ok) return;
        const j = await r.json();
        next = { city: j.city, shelters: j.shelters };
      } catch { return; }
    }
    if (wanted.current !== slug) return; // карту уже увели в другое место
    setSwitched(next);
    setSelected(selectId ?? null); setRoute(null); setNavActive(false); setRouteError(null);
    setQuery(""); setFStep(false); setFPets(false); setReports([]);
    window.history.replaceState(window.history.state, "", `/${slug}`); // адрес показывает текущий город, перезагрузка откроет его
    document.title = `Укрытия — ${(next?.city ?? city0).name} | Опора`;
  }, [city.slug, city0]);

  // Карта остановилась: если центр в области другого города, переключаемся на него. Не трогаем, пока открыта карточка, маршрут, навигатор или выбор точки.
  const guard = useRef({ busy: false, slug: city.slug });
  useEffect(() => { guard.current = { busy: navActive || picking || !!selected || !!route, slug: city.slug }; }, [navActive, picking, selected, route, city.slug]);
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (viewTimer.current) clearTimeout(viewTimer.current); }, []);
  const onViewChange = useCallback((v: { lng: number; lat: number; zoom: number }) => {
    if (viewTimer.current) clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => {
      const all = ptsRef.current;
      if (!all || v.zoom < 8.5 || guard.current.busy) return;
      const target = cityAt(all, v.lng, v.lat, guard.current.slug);
      if (target) switchTo(target);
    }, 600);
  }, [switchTo]);

  const pick = useCallback((id: string) => {
    if (!shelters.some((x) => x.id === id)) {
      // точка другого города: переключаемся на него и открываем её
      const all = ptsRef.current;
      const q = all?.p.find((x) => x[0] === id);
      if (all && q) switchTo(all.slugs[q[4]], id);
      return;
    }
    setSelected(id); setRoute(null); setNavActive(false); setRouteError(null);
  }, [shelters, switchTo]);
  const pickFromList = useCallback((id: string) => { setSelected(id); setRoute(null); setNavActive(false); setRouteError(null); if (isNarrow()) setTab("map"); }, []);

  const byDistance = useCallback(
    (pos: { lat: number; lng: number }) =>
      [...shelters].sort((a, b) => distanceKm(pos.lat, pos.lng, a.lat, a.lng) - distanceKm(pos.lat, pos.lng, b.lat, b.lng)),
    [shelters],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = me ? byDistance(me) : shelters;
    let found = q ? base.filter((s) => `${s.address} ${s.holder ?? ""}`.toLowerCase().includes(q)) : base;
    if (fStep) found = found.filter((s) => s.access?.stepFree === "yes");
    if (fPets) found = found.filter((s) => s.access?.pets === "yes");
    return { total: found.length, items: found };
  }, [query, me, byDistance, shelters, fStep, fPets]);

  const current = shelters.find((s) => s.id === selected) ?? null;
  const official = useMemo(() => shelters.filter((s) => s.origin !== "community"), [shelters]);
  const updated = official.map((s) => s.sourceUpdatedAt).sort().at(-1);
  const totalCapacity = useMemo(() => official.reduce((a, s) => a + (s.capacity ?? 0), 0), [official]);

  const locate = () => {
    setGeoError(false);
    setInfoOpen(false);
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
  const buildRoute = (target: Shelter, mode: "foot" | "car", from?: LngLat) => {
    setRouteError(null);
    if (!from) setRouteBusy(true);
    const go = async (pos: { lat: number; lng: number }) => {
      try {
        const r = await fetch(`/api/route?from=${pos.lng},${pos.lat}&to=${target.lng},${target.lat}&mode=${mode}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Не удалось построить маршрут");
        if (!from) setMe(pos);
        setRoute({ mode, variants: j.routes, at: Date.now() });
        setVariantIdx(0);
      } catch (e) {
        setRouteError(e instanceof Error ? e.message : "Не удалось построить маршрут");
      } finally {
        setRouteBusy(false);
      }
    };
    if (from) return void go({ lat: from[1], lng: from[0] });
    if (me) return void go(me);
    navigator.geolocation.getCurrentPosition(
      (p) => go({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setRouteBusy(false); setRouteError("Не удалось определить ваше местоположение. Разрешите доступ к геопозиции."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ───── навигатор ─────
  const variant = route?.variants[variantIdx] ?? null;
  const sim = typeof window !== "undefined" && window.location.search.includes("navsim");
  const { nav, error: navError } = useNavigation({
    active: navActive && !!variant,
    variant,
    mode: route?.mode ?? "foot",
    voice,
    sim,
    onReroute: (pos) => { if (current && route) buildRoute(current, route.mode, pos); },
  });
  const startNav = () => { setFollow(true); setNavActive(true); setTab("map"); };
  const stopNav = () => { setNavActive(false); setFollow(true); };

  // ссылка из режима «Тревога» (?go=ID): выбираем укрытие, строим пеший маршрут и сразу включаем навигатор
  const [goPending, setGoPending] = useState(false);
  const goTarget = useRef<Shelter | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("go");
    if (!id) return;
    const t = setTimeout(() => {
      const target = shelters.find((x) => x.id === id);
      if (!target) return;
      goTarget.current = target;
      setSelected(target.id);
      setTab("map");
      setGoPending(true);
      buildRoute(target, "foot");
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!goPending || !route) return;
    const t = setTimeout(() => { setGoPending(false); startNav(); }, 0);
    return () => clearTimeout(t);
  }, [goPending, route]);

  // копия списка для режима «Тревога» без сети: обновляется раз в сутки
  useEffect(() => {
    const key = `alarm-cache:${city.slug}`;
    try { const c = JSON.parse(localStorage.getItem(key) ?? "null"); if (c?.at && Date.now() - c.at < 86400_000) return; } catch {}
    fetch(`/api/shelters?city=${city.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) { try { localStorage.setItem(key, JSON.stringify({ name: j.city.name, shelters: j.shelters, at: j.at })); } catch {} } })
      .catch(() => {});
  }, [city.slug]);
  const zoom = (d: number) => window.dispatchEvent(new CustomEvent("map-zoom", { detail: d }));

  return (
    <div className={navActive ? "app navigating" : "app"} data-sheet={sheetOpen || undefined} data-card={(current && !picking) || undefined}>
      <CityMap
        center={city0.center} zoom={city0.zoom} shelters={shelters} selectedId={selected} onSelect={pick} me={me} flagged={flagged} others={others} onViewChange={onViewChange}
        picking={picking} picked={draft.lat != null && draft.lng != null ? { lat: draft.lat, lng: draft.lng } : null} onPick={onMapPick}
        basemap={basemap} fit={city0.fit} route={nav ? nav.line : variant?.coords ?? null} fitRoute={!navActive}
        alts={route && !navActive ? route.variants.filter((_, i) => i !== variantIdx).map((v) => v.coords) : []}
        navPos={nav ? { lng: nav.pos[0], lat: nav.pos[1], heading: nav.heading } : null} follow={navActive && follow} onUserMove={() => { if (navActive) setFollow(false); }}
      />

      {picking && (
        <div className="pick-hint glass">
          <MapPin size={18} /> Нажмите на карте место, которое хотите предложить
          <button onClick={() => { setPicking(false); setTab("suggest"); }}>Отмена</button>
        </div>
      )}

      {!online && !navActive && (
        <Link href="/alarm" className="offline-pill glass"><WifiOff size={16} />Нет сети: карта может не загрузиться. Откройте режим «Тревога»</Link>
      )}

      {!sheetOpen && !navActive && !picking && !current && (
        <div className="map-bar">
          <div className="map-pill glass">
            <BrandLogo height={24} />
            <button className="map-chip" onClick={() => setSearchOpen(true)} aria-label={`Город: ${city.name}. Сменить город`}>
              <MapPin size={15} /><span key={city.slug} className="map-chip-name swap">{city.name}</span><ChevronDown size={15} />
            </button>
          </div>
          <button className="map-info glass" onClick={() => setInfoOpen(true)} aria-label="О карте и источниках данных"><Info size={20} /></button>
        </div>
      )}

      <LocationPrompt current={city.slug} currentName={city.name} onChooseOther={() => setSearchOpen(true)} />

      <aside className="side" data-sheet={sheetOpen || undefined}>
        <section className="panel glass" data-tab={tab} data-search={searchOpen || undefined} data-sheet={sheetOpen || undefined} data-info={infoOpen || undefined} data-sub={(tab === "settings" && sub) || undefined} data-dir={dir}>
          {sheetOpen && (
            <div className="sheet-head">
              <h2>{searchOpen ? "Выбор города" : tab === "map" ? "О карте" : TABS.find((t) => t.key === tab)?.label}</h2>
              <button className="icon-btn big" aria-label="Закрыть" onClick={() => { if (searchOpen) setSearchOpen(false); else if (tab === "map") setInfoOpen(false); else setTab("map"); }}><X size={20} /></button>
            </div>
          )}
          {(chatSeen || tab === "chat") && (
            <div style={{ display: !searchOpen && tab === "chat" ? "contents" : "none" }}>
              <ChatPanel key={city.slug} room={city.slug} cityName={city.name} returnPath={`/${city.slug}`} onPickCity={() => setSearchOpen(true)} shown={!searchOpen && tab === "chat"} />
            </div>
          )}
          <div className="view" key={searchOpen ? "search" : tab === "map" ? (infoOpen ? "info" : "map") : tab === "settings" && sub ? `settings-${sub}` : tab}>
          {searchOpen && <CitySearch current={city.slug} onClose={() => setSearchOpen(false)} />}

          {!searchOpen && tab === "map" && (
            <>
              <div className="large-title">
                <h1 className="brand"><BrandLogo height={38} /><span className="sr-only">Опора — карта укрытий</span></h1>
                <button className="chip-city btn-like" onClick={() => setSearchOpen(true)} aria-label="Выбрать город"><MapPin size={14} /><span key={city.slug} className="chip-name swap">{city.name}</span><ChevronDown size={14} /></button>
              </div>
              <button className="primary" onClick={locate}><Navigation size={18} />Найти ближайшее</button>
              <Link href="/alarm" className="alarm-btn"><Siren size={20} />Режим «Тревога»</Link>
              {geoError && <p className="note">Не удалось определить местоположение. Откройте список и выберите точку вручную.</p>}
              {shelters.length === 0 && (
                <div className="card group">
                  <div className="group-row">
                    <span className="ico ico-amber"><Info size={16} /></span>
                    <div>В этом месте данных об укрытиях пока нет<small>Предложите место на вкладке «Добавить»: заявки проверяет модератор. Для крупных городов мы подключаем официальные списки.</small></div>
                  </div>
                </div>
              )}
              {shelters.length > 0 && <div className="stats">
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
              </div>}
              <div className="card group">
                {official.length > 0 && (
                  <div className="group-row">
                    <span className="ico ico-gray"><Clock size={16} /></span>
                    <div>Данные администрации от {updated ? fmtDate(updated) : "—"}<small>Источник и дата указаны в паспорте каждой точки</small></div>
                  </div>
                )}
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
              <ContactBlock />
            </>
          )}

          {!searchOpen && tab === "list" && (
            <>
              <div className="large-title"><h2>Список</h2><span className="chip-city"><LayoutGrid size={14} />{visible.total}</span></div>
              <div className="field-input">
                <Search size={17} />
                <input className="search" type="search" placeholder="Адрес или организация" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="filters" role="group" aria-label="Фильтры">
                <button className={fStep ? "fchip on" : "fchip"} aria-pressed={fStep} onClick={() => setFStep((v) => !v)}><Accessibility size={15} />Без ступеней</button>
                <button className={fPets ? "fchip on" : "fchip"} aria-pressed={fPets} onClick={() => setFPets((v) => !v)}><PawPrint size={15} />С животными</button>
              </div>
              {(fStep || fPets) && <p className="note">Фильтры показывают только точки с подтверждёнными сведениями о доступности.</p>}
              <p className="note">
                {visible.total === 0 ? "Ничего не найдено." : `Найдено: ${visible.total.toLocaleString("ru-RU")}${me ? " · по удалённости" : ""}`}
              </p>
              <ul className="list">
                {visible.items.map((s) => (
                  <ShelterRow key={s.id} s={s} active={s.id === selected} warn={flagged.includes(s.id)} dist={me ? distanceKm(me.lat, me.lng, s.lat, s.lng) : null} onPick={pickFromList} />
                ))}
              </ul>
            </>
          )}


          {!searchOpen && tab === "radar" && <RadarPanel shown regionName={city.region || undefined} citySlug={city.slug} />}

          {!searchOpen && tab === "suggest" && (
            <SuggestForm citySlug={city.slug} draft={draft} setDraft={setDraft} onPickOnMap={() => { setPicking(true); setTab("map"); }} />
          )}

          {!searchOpen && tab === "settings" && sub === "faq" && <FaqView onBack={() => setSub(null)} />}
          {!searchOpen && tab === "settings" && sub === "docs" && <DocsView onBack={() => setSub(null)} />}
          {!searchOpen && tab === "settings" && sub === "stats" && <HelpView onBack={() => setSub(null)} />}
          {!searchOpen && tab === "settings" && !sub && (
            <div className="about">
              <div className="large-title"><h2>Настройки</h2></div>
              <ProfileLinks onOpen={setSub} />
              <PushSettings regionName={city.region || "Ростовская область"} city={city.slug} />
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Palette size={16} />Оформление</h2>
              <ThemeSwitch />
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Smartphone size={16} />Приложение и офлайн</h2>
              <OfflineSettings citySlug={city.slug} />
              <AccessibilitySettings />
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><MapIcon size={16} />Подложка карты</h2>
              <BasemapSwitch />
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Info size={16} />О сервисе</h2>
              <div className="card" style={{ padding: "6px 10px" }}>
                <p>Мы показываем только места из открытых официальных источников. У каждой точки указан источник и дата данных.</p>
                <p>Заявки жителей проверяет модератор. Сообщения о входе («открыт / закрыт») не меняют официальный статус и устаревают через {REPORT_TTL_HOURS} ч.</p>
                <p>Информация не гарантирует безопасность и доступность входа. Следуйте оповещениям МЧС.</p>
                <p>Каталог населённых пунктов: GeoNames (CC BY 4.0). Карты: © Яндекс, © участники OpenStreetMap. Маршруты: OSRM.</p>
              </div>
            </div>
          )}
          </div>
        </section>

        <nav className="dock glass" aria-label="Разделы">
          <span className="dock-pill" style={{ "--i": TABS.findIndex((x) => x.key === tab), "--n": TABS.length } as React.CSSProperties} aria-hidden="true" />
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} className={tab === key ? "dock-tab on" : "dock-tab"} onClick={() => { setTab(key); setInfoOpen(false); }} aria-current={tab === key}>
              <Icon size={21} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {current && !picking && (
        <Passport key={current.id} citySlug={city.slug} route={route} variantIdx={variantIdx} onVariant={setVariantIdx} onStartNav={startNav} routeBusy={routeBusy} routeError={routeError} onRoute={(m) => buildRoute(current, m)} onClearRoute={() => { setRoute(null); setRouteError(null); }} s={current} me={me} summary={currentReport} onSent={loadReports} onClose={() => setSelected(null)} hideOnNarrow={tab !== "map"} />
      )}

      {navActive && (
        <NavOverlay nav={nav} error={navError} target={current} follow={follow} voice={voice} rerouting={!!nav?.offRoute}
          onVoice={() => setVoice((v) => !v)} onRecenter={() => setFollow(true)} onStop={stopNav} />
      )}

      {layersOpen && <div className="layers-pop glass"><BasemapSwitch compact /></div>}
      <div className="controls">
        <Link href="/alarm" className="ctl-btn alarm-fab" aria-label="Режим тревоги"><Siren size={22} /></Link>
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

function Passport({ citySlug, route, variantIdx, onVariant, onStartNav, routeBusy, routeError, onRoute, onClearRoute, s, me, summary, onSent, onClose, hideOnNarrow }: { citySlug: string; route: RouteInfo | null; variantIdx: number; onVariant: (i: number) => void; onStartNav: () => void; routeBusy: boolean; routeError: string | null; onRoute: (m: "foot" | "car") => void; onClearRoute: () => void; s: Shelter; me: { lat: number; lng: number } | null; summary: ReportSummary | null; onSent: () => void; onClose: () => void; hideOnNarrow: boolean }) {
  const [sent, setSent] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (kind: ReportKind) => {
    setBusy(true);
    try {
      const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: citySlug, shelterId: s.id, kind }) });
      const j = await r.json().catch(() => ({}));
      setSent(r.ok ? { ok: true, text: "Спасибо, сообщение принято." } : { ok: false, text: `${j.error ?? "Не удалось отправить."}${j.code ? ` (код: ${j.code})` : ""}` });
      if (r.ok) { bumpHelp("reports"); onSent(); }
    } catch {
      setSent({ ok: false, text: "Нет соединения. Попробуйте позже." });
    } finally {
      setBusy(false);
    }
  };
  const warn = summary && summary.problems6h >= WARN_THRESHOLD;

  // фото: одобренные сверху, предложение нового — через сжатие на устройстве
  const [photos, setPhotos] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ blob: Blob; url: string } | null>(null);
  const [agree, setAgree] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/photos?shelter=${s.id}`).then((r) => r.json()).then((j) => alive && setPhotos((j.photos ?? []).map((p: { id: string }) => p.id))).catch(() => {});
    return () => { alive = false; };
  }, [s.id]);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoMsg(null);
    try {
      const blob = await compressImage(file);
      setDraft({ blob, url: URL.createObjectURL(blob) });
      setAgree(false);
    } catch (e) {
      setPhotoMsg({ ok: false, text: e instanceof Error ? e.message : "Не удалось обработать фото." });
    }
  };
  const sendPhoto = async () => {
    if (!draft) return;
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", draft.blob, "photo.jpg");
      fd.set("shelterId", s.id);
      fd.set("city", citySlug);
      fd.set("consent", "1");
      const r = await fetch("/api/photos", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${j.error ?? "Не удалось отправить."}${j.code ? ` (код: ${j.code})` : ""}`);
      setDraft(null);
      bumpHelp("photos");
      setPhotoMsg({ ok: true, text: "Спасибо! Фото отправлено на проверку и появится после одобрения." });
    } catch (e) {
      setPhotoMsg({ ok: false, text: e instanceof Error ? e.message : "Не удалось отправить." });
    } finally {
      setPhotoBusy(false);
    }
  };
  const { Icon: HeadIcon, cls } = iconFor(s);

  const rows: PRow[] = [
    { Icon: Layers, label: "Тип объекта", value: title(s) },
    ...(s.holder ? [{ Icon: Building2, label: "Организация / ориентир", value: s.holder }] : []),
    { Icon: Users, label: "Вместимость", value: s.capacity ? `${s.capacity.toLocaleString("ru-RU")} чел.` : "не указана" },
    ...(s.area ? [{ Icon: Ruler, label: "Площадь", value: `${s.area.toLocaleString("ru-RU")} м²` }] : []),
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
      {photos.length > 0 && (
        <div className="gallery">
          {photos.map((id) => (
            <a key={id} href={`/api/photos/${id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${id}`} alt={`Фото: ${s.address}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <p className="passport-addr">{s.address}</p>
      <MyShelterButton s={s} citySlug={citySlug} />

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
            <button className="btn" disabled={routeBusy} onClick={() => onRoute("foot")}>{routeBusy ? <Spinner size={18} /> : <Footprints size={18} />}{routeBusy ? "Строим маршрут…" : "Пешком"}</button>
            <button className="btn btn-ghost-wide" disabled={routeBusy} onClick={() => onRoute("car")}><Car size={18} />На машине</button>
          </div>
        )}
        {routeError && <p className="err">{routeError}</p>}
        {route && (() => {
          const v = route.variants[variantIdx] ?? route.variants[0];
          const arrival = new Date(route.at + v.duration * 1000);
          return (
            <>
              <div className="route-sum">
                <span className="ico ico-blue">{route.mode === "foot" ? <Footprints size={18} /> : <Car size={18} />}</span>
                <div>
                  <b>{fmtDist(v.distance)} · {fmtTime(v.duration)}</b>
                  <small>{route.mode === "foot" ? "пешком" : "на машине"}, по открытым данным OSM</small>
                </div>
                <span className="chip data">прибытие {formatClock(arrival)}</span>
                <button className="icon-btn" aria-label="Сбросить маршрут" onClick={onClearRoute}><X size={18} /></button>
              </div>
              {route.variants.length > 1 && (
                <div className="segmented" role="radiogroup" aria-label="Вариант маршрута" style={{ gridTemplateColumns: `repeat(${route.variants.length}, 1fr)`, marginBottom: 10 }}>
                  {route.variants.map((alt, i) => (
                    <button key={i} role="radio" aria-checked={i === variantIdx} className={i === variantIdx ? "seg on" : "seg"} onClick={() => onVariant(i)}>
                      {fmtTime(alt.duration)} · {fmtDist(alt.distance)}
                    </button>
                  ))}
                </div>
              )}
              <button className="primary go" onClick={onStartNav}><Navigation size={20} />{route.mode === "foot" ? "Пошли" : "Поехали"}</button>
              <details className="steps">
                <summary><ListOrdered size={15} />Пошаговый маршрут ({v.steps.length})</summary>
                <ol>{v.steps.map((st, i) => <li key={i}>{st.text}{st.distance > 0 && <small> · {fmtDist(st.distance)}</small>}</li>)}</ol>
              </details>
              <div className="route-btns">
                <button className="btn btn-ghost-wide" onClick={() => onRoute(route.mode === "foot" ? "car" : "foot")}>{route.mode === "foot" ? <><Car size={16} />На машине</> : <><Footprints size={16} />Пешком</>}</button>
              </div>
            </>
          );
        })()}
        <div className="ext-links">
          <a target="_blank" rel="noreferrer" href={`https://yandex.ru/maps/?rtext=~${s.lat},${s.lng}&rtt=pd`}>Открыть в Яндекс.Картах</a>
          <a target="_blank" rel="noreferrer" href={`https://2gis.ru/routeSearch/rsType/pedestrian/to/${s.lng},${s.lat}`}>2ГИС</a>
        </div>
        <p className="note" style={{ margin: "6px 0 0" }}>Маршрут ориентировочный: проверяйте обстановку и следуйте указаниям МЧС.</p>
      </div>

      <AccessBlock key={s.id} s={s} citySlug={citySlug} />

      <Checklist autoOpen={!!route} />

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

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        {!draft && <button className="photo-btn" onClick={() => fileRef.current?.click()}><Camera size={18} />Предложить фото</button>}
        {draft && (
          <div className="photo-draft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.url} alt="Предпросмотр" />
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>Подтверждаю: снято с общедоступного места, на фото нет людей, лиц, номеров автомобилей, охраны, схем и планов объекта. Согласен на обработку фото на условиях <Link href="/privacy" target="_blank">Политики</Link>.</span>
            </label>
            <div className="route-btns">
              <button className="btn" disabled={!agree || photoBusy} onClick={sendPhoto}>{photoBusy && <Spinner size={16} />}{photoBusy ? "Отправляем…" : "Отправить на проверку"}</button>
              <button className="btn btn-ghost-wide" onClick={() => setDraft(null)}>Отмена</button>
            </div>
          </div>
        )}
        {photoMsg && <p className={photoMsg.ok ? "ok" : "err"}>{photoMsg.text}</p>}
        <p className="note" style={{ marginLeft: 0 }}>Сообщайте только то, что заметили сами. Не подвергайте себя опасности ради проверки.</p>
      </div>

      <p className="note">
        {s.origin === "community" ? "Точка добавлена по сообщению жителя и не подтверждена официальным источником." : "Данные взяты из списка администрации и могут устареть."} Вместимость и доступность входа не гарантируются.
      </p>
    </aside>
  );
}

function NavOverlay({ nav, error, target, follow, voice, rerouting, onVoice, onRecenter, onStop }: {
  nav: NavState | null; error: string | null; target: Shelter | null; follow: boolean; voice: boolean; rerouting: boolean;
  onVoice: () => void; onRecenter: () => void; onStop: () => void;
}) {
  const next = nav?.next ?? null;
  const mins = nav ? Math.max(1, Math.round(nav.remainingSec / 60)) : 0;
  return (
    <>
      <div className="nav-top glass" role="status" aria-live="polite">
        {!nav ? (
          <p className="nav-wait">{!error && <Spinner size={20} />}{error ?? "Определяем ваше местоположение…"}</p>
        ) : nav.arrived ? (
          <>
            <span className="nav-ico done"><Flag size={30} /></span>
            <div className="nav-main"><b className="nav-dist">Вы прибыли</b><span>{target?.address}</span></div>
          </>
        ) : (
          <>
            <span className="nav-ico"><ManeuverIcon step={next} size={34} /></span>
            <div className="nav-main">
              <b className="nav-dist">{next && next.type !== "arrive" ? roundDist(nav.distToNext) : roundDist(nav.remaining)}</b>
              <span>{rerouting ? "Пересчитываем маршрут…" : next?.text ?? "Двигайтесь по маршруту"}</span>
              {!rerouting && nav.then && next?.type !== "arrive" && nav.then.text !== next?.text && <small>Затем: {nav.then.text}</small>}
            </div>
          </>
        )}
      </div>

      <div className="nav-bottom glass">
        <div className="nav-eta">
          {nav ? (
            <>
              <b>{mins} мин</b>
              <span>{roundDist(nav.remaining)} · прибытие {formatClock(nav.arrival)}</span>
              <small>{target?.address}</small>
            </>
          ) : <span className="nav-wait-row">{!error && <Spinner size={16} />}{error ?? "Ждём сигнал GPS…"}</span>}
        </div>
        <button className="icon-btn big" aria-label={voice ? "Выключить голос" : "Включить голос"} aria-pressed={voice} onClick={onVoice}>{voice ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
        {!follow && <button className="icon-btn big accent" aria-label="Вернуться к моей позиции" onClick={onRecenter}><LocateFixed size={20} /></button>}
        <button className="icon-btn big" aria-label="Завершить навигацию" onClick={onStop}><X size={20} /></button>
      </div>
    </>
  );
}
