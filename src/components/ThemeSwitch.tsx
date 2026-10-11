"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Pref = "system" | "light" | "dark";
const OPTIONS: { key: Pref; label: string; Icon: typeof Sun }[] = [
  { key: "system", label: "Системная", Icon: Monitor },
  { key: "light", label: "Светлая", Icon: Sun },
  { key: "dark", label: "Тёмная", Icon: Moon },
];

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.pref = pref;
}

// Предпочтение хранится в localStorage; useSyncExternalStore даёт одинаковый HTML на сервере и клиенте.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
};
const read = (): Pref => {
  try {
    const v = localStorage.getItem("theme-pref");
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
};

export default function ThemeSwitch() {
  const pref = useSyncExternalStore(subscribe, read, () => "system" as Pref);

  // в режиме «Системная» следуем за переключением темы в ОС
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);

  const choose = (p: Pref) => {
    try { localStorage.setItem("theme-pref", p); } catch {}
    apply(p);
    listeners.forEach((l) => l());
  };

  return (
    <div className="segmented" role="radiogroup" aria-label="Тема оформления">
      {OPTIONS.map(({ key, label, Icon }) => (
        <button key={key} role="radio" aria-checked={pref === key} className={pref === key ? "seg on" : "seg"} onClick={() => choose(key)}>
          <Icon size={16} strokeWidth={2} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
