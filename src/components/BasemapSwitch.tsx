"use client";

import { Check, Globe2, Map as MapIcon, type LucideIcon } from "lucide-react";
import { BASEMAPS, DEFAULT_BASEMAP, getBasemap } from "@/lib/basemaps";
import { usePref } from "@/lib/use-pref";

const ICONS: Record<string, LucideIcon> = { yandex: MapIcon, "yandex-new": MapIcon, custom: MapIcon, osm: Globe2 };

export const useBasemapId = () => {
  const [id, set] = usePref("basemap", DEFAULT_BASEMAP);
  return [getBasemap(id).id, set] as const;
};

export default function BasemapSwitch({ compact = false }: { compact?: boolean }) {
  const [id, set] = useBasemapId();
  return (
    <div className={compact ? "basemaps compact" : "card group basemaps"} role="radiogroup" aria-label="Подложка карты">
      {BASEMAPS.map((b) => {
        const Icon = ICONS[b.id] ?? MapIcon;
        return (
          <button key={b.id} role="radio" aria-checked={id === b.id} className={id === b.id ? "bm-row on" : "bm-row"} onClick={() => set(b.id)}>
            <span className={`ico ${id === b.id ? "ico-green" : "ico-gray"}`}><Icon size={18} /></span>
            <span className="bm-text"><b>{b.label}</b><small>{b.hint}</small></span>
            {id === b.id && <Check size={18} className="bm-check" />}
          </button>
        );
      })}
    </div>
  );
}
