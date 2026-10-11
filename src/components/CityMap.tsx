"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
import { mapStyle } from "@/lib/mapStyle";
import type { Shelter } from "@/lib/shelters";

type Props = {
  center: [number, number];
  zoom: number;
  shelters: Shelter[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: { lat: number; lng: number } | null;
};

export default function CityMap({ center, zoom, shelters, selectedId, onSelect, me }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: mapStyle, center, zoom });
        map.current = m;
    return () => m.remove();
  }, [center, zoom]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const markers = shelters.map((s) => {
      const node = document.createElement("button");
      node.className = `pin pin-${s.kind}` + (s.id === selectedId ? " pin-active" : "");
      node.setAttribute("aria-label", s.address);
      node.onclick = () => onSelect?.(s.id);
      return new maplibregl.Marker({ element: node }).setLngLat([s.lng, s.lat]).addTo(m);
    });
    return () => markers.forEach((x) => x.remove());
  }, [shelters, selectedId, onSelect]);

  useEffect(() => {
    const m = map.current;
    if (!m || !me) return;
    const dot = document.createElement("div");
    dot.className = "me";
    const marker = new maplibregl.Marker({ element: dot }).setLngLat([me.lng, me.lat]).addTo(m);
    return () => { marker.remove(); };
  }, [me]);

  useEffect(() => {
    const s = shelters.find((x) => x.id === selectedId);
    if (s) map.current?.flyTo({ center: [s.lng, s.lat], zoom: 15 });
  }, [selectedId, shelters]);

  useEffect(() => {
    const onZoom = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      if (d > 0) map.current?.zoomIn(); else map.current?.zoomOut();
    };
    window.addEventListener("map-zoom", onZoom);
    return () => window.removeEventListener("map-zoom", onZoom);
  }, []);

  return <div ref={el} className="map" />;
}
