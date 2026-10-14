"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { emptyStyle, rasterSource } from "@/lib/mapStyle";
import type { Basemap } from "@/lib/basemaps";
import type { Shelter } from "@/lib/shelters";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

// Точки других городов: фоновый слой, чтобы при отдалении были видны все объекты системы
export type OtherPoint = { id: string; lat: number; lng: number; kind: string };

type Props = {
  center: [number, number];
  zoom: number;
  shelters: Shelter[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: { lat: number; lng: number } | null;
  flagged?: string[]; // точки, по которым жители сообщают о проблеме со входом
  picking?: boolean; // режим выбора точки для новой заявки
  picked?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  basemap: Basemap;
  fit?: [number, number, number, number]; // вписать карту в границы (для найденных мест)
  route?: [number, number][] | null; // линия маршрута [lng, lat][]
  fitRoute?: boolean; // вписывать маршрут в экран (в режиме навигатора выключено)
  alts?: [number, number][][]; // запасные варианты маршрута (серые линии)
  navPos?: { lng: number; lat: number; heading: number | null } | null; // позиция в режиме навигатора
  follow?: boolean; // камера следует за стрелкой
  onUserMove?: () => void; // пользователь сам двинул карту
  others?: OtherPoint[]; // точки остальных городов
  onViewChange?: (v: { lng: number; lat: number; zoom: number }) => void; // карта остановилась в новом месте
};

const SRC = "shelters";
const KIND_COLOR = ["case", ["==", ["get", "flag"], 1], "#e0a100", ["match", ["get", "kind"], "official_shelter", "#1f9d55", "other_shelter", "#1f9d55", "help_point", "#1b6ef3", "#8b93a1"]];

export default function CityMap({ center, zoom, shelters, selectedId, onSelect, me, flagged, picking, picked, onPick, basemap, fit, route, fitRoute = true, alts, navPos, follow, onUserMove, others, onViewChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  const sheltersRef = useRef(shelters);
  const fitKey = fit?.join(",") ?? "";
  const fitRef = useRef(fit);
  const onUserMoveRef = useRef(onUserMove);
  const othersRef = useRef<OtherPoint[]>(others ?? []);
  const onViewChangeRef = useRef(onViewChange);
  const arrow = useRef<maplibregl.Marker | null>(null);
  const navWas = useRef(false);
  const baseRef = useRef(basemap);
  const themeRef = useRef<() => void>(() => {});
  const flaggedRef = useRef<Set<string>>(new Set());
  const pickingRef = useRef(false);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onSelectRef.current = onSelect;
    sheltersRef.current = shelters;
    flaggedRef.current = new Set(flagged ?? []);
    pickingRef.current = !!picking;
    onPickRef.current = onPick;
    baseRef.current = basemap;
    fitRef.current = fit;
    onUserMoveRef.current = onUserMove;
    othersRef.current = others ?? [];
    onViewChangeRef.current = onViewChange;
  }, [onSelect, shelters, flagged, picking, onPick, basemap, fit, onUserMove, others, onViewChange]);

  // инициализация карты, источника и слоёв
  useEffect(() => {
    if (!el.current) return;
    const narrow = window.innerWidth <= 760;
    const m = new maplibregl.Map({
      container: el.current,
      style: emptyStyle,
      ...(fitKey
        ? { bounds: [[fitRef.current![0], fitRef.current![1]], [fitRef.current![2], fitRef.current![3]]] as [[number, number], [number, number]], fitBoundsOptions: { padding: { top: 30, bottom: narrow ? 110 : 30, left: narrow ? 20 : 430, right: 70 }, maxZoom: 16 } }
        : { center, zoom }),
    });
    map.current = m;
    const clusterMarkers = new Map<number, maplibregl.Marker>();

    const syncClusters = () => {
      if (!m.getSource(SRC)) return;
      const seen = new Set<number>();
      for (const f of m.querySourceFeatures(SRC, { filter: ["has", "point_count"] })) {
        const id = f.properties!.cluster_id as number;
        if (seen.has(id)) continue;
        seen.add(id);
        if (clusterMarkers.has(id)) continue;
        const node = document.createElement("button");
        node.className = "cluster";
        node.textContent = String(f.properties!.point_count_abbreviated);
        node.onclick = async () => {
          const z = await (m.getSource(SRC) as maplibregl.GeoJSONSource).getClusterExpansionZoom(id);
          m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z });
        };
        clusterMarkers.set(id, new maplibregl.Marker({ element: node }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).addTo(m));
      }
      for (const [id, mk] of clusterMarkers) if (!seen.has(id)) { mk.remove(); clusterMarkers.delete(id); }
    };

    const applyTheme = () => {
      if (!m.getLayer("base")) return;
      // тёмная тема: растровую схему инвертируем по яркости
      const dark = document.documentElement.dataset.theme === "dark";
      m.setPaintProperty("base", "raster-brightness-min", dark ? 0.92 : 0);
      m.setPaintProperty("base", "raster-brightness-max", dark ? 0.04 : 1);
      m.setPaintProperty("base", "raster-hue-rotate", dark ? 180 : 0);
      m.setPaintProperty("base", "raster-saturation", dark ? -0.35 : 0);
    };
    themeRef.current = applyTheme;
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    m.on("load", () => {
      addBase(m, baseRef.current);
      applyTheme();
      m.addSource(SRC, {
        type: "geojson",
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 15,
        data: toGeoJSON(sheltersRef.current, flaggedRef.current, othersRef.current),
      });
      m.addLayer({ id: "pts", type: "circle", source: SRC, filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 7, "circle-color": KIND_COLOR as never, "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
      m.addLayer({ id: "sel", type: "circle", source: SRC, filter: ["==", ["get", "id"], ""],
        paint: { "circle-radius": 11, "circle-color": "#e5484d", "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
      m.addSource("route-alt", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "route-alt", type: "line", source: "route-alt", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#8b93a1", "line-width": 5, "line-opacity": 0.85 } });
      m.addSource("route", { type: "geojson", data: lineData(null) });
      m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2f7cf6", "line-width": 5 } });
      m.on("click", (e) => { if (pickingRef.current) onPickRef.current?.(e.lngLat.lat, e.lngLat.lng); });
      m.on("click", "pts", (e) => { if (pickingRef.current) return; const id = e.features?.[0]?.properties?.id; if (id) onSelectRef.current?.(id); });
      m.on("mouseenter", "pts", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "pts", () => (m.getCanvas().style.cursor = ""));
      m.on("render", syncClusters);
      m.on("dragstart", (e) => { if (e.originalEvent) onUserMoveRef.current?.(); });
      m.on("zoomstart", (e) => { if (e.originalEvent) onUserMoveRef.current?.(); });
      m.on("moveend", () => { const c = m.getCenter(); onViewChangeRef.current?.({ lng: c.lng, lat: c.lat, zoom: m.getZoom() }); });
      ready.current = true;
    });
    return () => { ready.current = false; themeObserver.disconnect(); clusterMarkers.clear(); m.remove(); };
  }, [center, zoom, fitKey]);

  // переключение подложки на лету
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    addBase(m, basemap, m.getLayer("pts") ? "pts" : undefined);
    themeRef.current();
  }, [basemap]);

  // маршрут: рисуем линию и показываем её целиком
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(lineData(route ?? null));
    if (route && route.length > 1 && fitRoute) {
      const b = new maplibregl.LngLatBounds(route[0], route[0]);
      route.forEach((c) => b.extend(c));
      m.fitBounds(b, { padding: { top: 60, bottom: 120, left: isNarrowScreen() ? 40 : 440, right: 70 }, duration: 900, maxZoom: 17 });
    }
  }, [route, fitRoute]);

  // запасные маршруты
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("route-alt") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: (alts ?? []).filter((c) => c.length > 1).map((c) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } })),
    });
  }, [alts]);

  // стрелка навигатора и камера, следующая за ней
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!navPos) {
      arrow.current?.remove();
      arrow.current = null;
      if (navWas.current) { navWas.current = false; m.easeTo({ pitch: 0, bearing: 0, duration: 600 }); }
      return;
    }
    navWas.current = true;
    if (!arrow.current) {
      const node = document.createElement("div");
      node.className = "nav-arrow";
      arrow.current = new maplibregl.Marker({ element: node, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([navPos.lng, navPos.lat]).addTo(m);
    }
    arrow.current.setLngLat([navPos.lng, navPos.lat]);
    if (navPos.heading != null) arrow.current.setRotation(navPos.heading);
    if (follow) {
      const narrow = window.innerWidth <= 760;
      m.easeTo({
        center: [navPos.lng, navPos.lat], zoom: 17, pitch: 45, bearing: navPos.heading ?? m.getBearing(), duration: 700, essential: true,
        padding: { top: narrow ? 150 : 130, bottom: narrow ? 200 : 120, left: 0, right: 0 },
      });
    }
  }, [navPos, follow]);

  // подсветка выбранной точки и перелёт к ней
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    m.setFilter("sel", ["==", ["get", "id"], selectedId ?? ""]);
    const s = shelters.find((x) => x.id === selectedId);
    if (s) m.flyTo({ center: [s.lng, s.lat], zoom: Math.max(m.getZoom(), 16) });
  }, [selectedId, shelters]);

  // отметки жителей: перекрашиваем точки с предупреждением
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource(SRC) as maplibregl.GeoJSONSource | undefined)?.setData(toGeoJSON(shelters, new Set(flagged ?? []), others ?? []));
  }, [flagged, shelters, others]);

  // режим выбора точки и выбранная точка новой заявки
  useEffect(() => {
    const m = map.current;
    if (m) m.getCanvas().style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  useEffect(() => {
    const m = map.current;
    if (!m || !picked) return;
    const node = document.createElement("div");
    node.className = "pin-new";
    const marker = new maplibregl.Marker({ element: node }).setLngLat([picked.lng, picked.lat]).addTo(m);
    return () => { marker.remove(); };
  }, [picked]);

  // позиция пользователя
  useEffect(() => {
    const m = map.current;
    if (!m || !me) return;
    const dot = document.createElement("div");
    dot.className = "me";
    const marker = new maplibregl.Marker({ element: dot }).setLngLat([me.lng, me.lat]).addTo(m);
    return () => { marker.remove(); };
  }, [me]);

  useEffect(() => {
    const onZoom = (e: Event) => {
      if ((e as CustomEvent<number>).detail > 0) map.current?.zoomIn(); else map.current?.zoomOut();
    };
    window.addEventListener("map-zoom", onZoom);
    return () => window.removeEventListener("map-zoom", onZoom);
  }, []);

  return <div ref={el} className="map" />;
}

const isNarrowScreen = () => typeof window !== "undefined" && window.innerWidth <= 760;

function lineData(route: [number, number][] | null): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: route && route.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } }] : [] };
}

// Подложка = растровый слой "base" ; пересоздаётся при смене.
function addBase(m: maplibregl.Map, b: Basemap, before?: string) {
  for (const id of ["base"]) {
    if (m.getLayer(id)) m.removeLayer(id);
    if (m.getSource(id)) m.removeSource(id);
  }
  m.addSource("base", rasterSource(b.tiles, b));
  m.addLayer({ id: "base", type: "raster", source: "base" }, before);
}

function toGeoJSON(list: Shelter[], flagged: Set<string>, others: OtherPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      ...list.map((s): GeoJSON.Feature => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: { id: s.id, kind: s.kind, flag: flagged.has(s.id) ? 1 : 0 },
      })),
      ...others.map((o): GeoJSON.Feature => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [o.lng, o.lat] },
        properties: { id: o.id, kind: o.kind, flag: 0 },
      })),
    ],
  };
}
