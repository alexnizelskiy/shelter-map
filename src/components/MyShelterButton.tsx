"use client";

import { Star } from "lucide-react";
import { LABELS, MY_KEY, parseMy, withShelter, type MyShelter } from "@/lib/my-shelters";
import { usePref } from "@/lib/use-pref";
import type { Shelter } from "@/lib/shelters";

// «Моё укрытие»: запоминаем место на устройстве (дом / работа / другое), чтобы режим «Тревога» открывал его первым, в том числе без сети
export default function MyShelterButton({ s, citySlug }: { s: Shelter; citySlug: string }) {
  const [raw, setRaw] = usePref(MY_KEY, "[]");
  const list = parseMy(raw);
  const mineLabel = list.find((m) => m.id === s.id)?.label;

  const toggle = (label: MyShelter["label"]) => {
    if (mineLabel === label) return setRaw(JSON.stringify(list.filter((m) => m.id !== s.id)));
    const entry: MyShelter = { id: s.id, city: citySlug, label, address: s.address, holder: s.holder, capacity: s.capacity, lat: s.lat, lng: s.lng };
    setRaw(JSON.stringify(withShelter(list, entry)));
  };

  return (
    <div className="my-row" role="group" aria-label="Сделать моим укрытием">
      <span className="my-title"><Star size={15} />Моё укрытие:</span>
      {(Object.keys(LABELS) as MyShelter["label"][]).map((l) => (
        <button key={l} className={mineLabel === l ? "fchip on" : "fchip"} aria-pressed={mineLabel === l} onClick={() => toggle(l)}>
          <Star size={13} fill={mineLabel === l ? "currentColor" : "none"} />{LABELS[l]}
        </button>
      ))}
    </div>
  );
}
