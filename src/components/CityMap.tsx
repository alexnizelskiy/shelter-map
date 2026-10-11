"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { mapStyle } from "@/lib/mapStyle";
import type { Shelter } from "@/lib/shelters";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

type Props = {
  center: [number, number];
  zoom: number;
  shelters: Shelter[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: { lat: number; lng: number } | null;
};

const SRC = "shelters";
const KIND_COLOR = ["match", ["get", "kind"], "official_shelter", "#1f9d55", "other_shelter", "#1f9d55", "help_point", "#1b6ef3", "#8b93a1"];

export default function CityMap({ center, zoom, shelters, selectedId, onSelect, me }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  const sheltersRef = useRef(shelters);
  useEffect(() => {
    onSelectRef.current = onSelect;
    sheltersRef.current = shelters;
  }, [onSelect, shelters]);

  // инициализация карты, источника и слоёв
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: mapStyle, center, zoom });
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

    m.on("load", () => {
      m.addSource(SRC, {
        type: "geojson",
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 15,
        data: toGeoJSON(sheltersRef.current),
      });
      m.addLayer({ id: "pts", type: "circle", source: SRC, filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 7, "circle-color": KIND_COLOR as never, "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
      m.addLayer({ id: "sel", type: "circle", source: SRC, filter: ["==", ["get", "id"], ""],
        paint: { "circle-radius": 11, "circle-color": "#e5484d", "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
      m.on("click", "pts", (e) => { const id = e.features?.[0]?.properties?.id; if (id) onSelectRef.current?.(id); });
      m.on("mouseenter", "pts", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "pts", () => (m.getCanvas().style.cursor = ""));
      m.on("render", syncClusters);
      ready.current = true;
    });
    return () => { ready.current = false; clusterMarkers.clear(); m.remove(); };
  }, [center, zoom]);

  // подсветка выбранной точки и перелёт к ней
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    m.setFilter("sel", ["==", ["get", "id"], selectedId ?? ""]);
    const s = shelters.find((x) => x.id === selectedId);
    if (s) m.flyTo({ center: [s.lng, s.lat], zoom: Math.max(m.getZoom(), 16) });
  }, [selectedId, shelters]);

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

function toGeoJSON(list: Shelter[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: list.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { id: s.id, kind: s.kind },
    })),
  };
}
