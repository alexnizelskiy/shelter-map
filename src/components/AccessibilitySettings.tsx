"use client";

import { Contrast, Type } from "lucide-react";
import { usePref } from "@/lib/use-pref";

const FONTS = [
  { v: "1", label: "Обычный", px: 15 },
  { v: "1.15", label: "Крупный", px: 18 },
  { v: "1.3", label: "Очень крупный", px: 21 },
  { v: "1.5", label: "Огромный", px: 24 },
];

const apply = (name: "font" | "contrast", value: string | null) => {
  const root = document.documentElement;
  if (value) root.dataset[name] = value; else delete root.dataset[name];
};

// Размер шрифта и контрастность: хранятся на устройстве и применяются ко всему интерфейсу
export default function AccessibilitySettings() {
  const [font, setFont] = usePref("ui-font", "1");
  const [contrast, setContrast] = usePref("ui-contrast", "normal");

  return (
    <>
      <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Type size={16} />Размер шрифта</h2>
      <div className="segmented fonts" role="radiogroup" aria-label="Размер шрифта">
        {FONTS.map((f) => (
          <button key={f.v} role="radio" aria-checked={font === f.v} className={font === f.v ? "seg on" : "seg"} onClick={() => { setFont(f.v); apply("font", f.v === "1" ? null : f.v); }}>
            <span style={{ fontSize: f.px, fontWeight: 700, lineHeight: 1 }}>А</span>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Contrast size={16} />Контрастность</h2>
      <div className="segmented two" role="radiogroup" aria-label="Контрастность">
        {[{ v: "normal", label: "Обычная" }, { v: "high", label: "Высокая" }].map((c) => (
          <button key={c.v} role="radio" aria-checked={contrast === c.v} className={contrast === c.v ? "seg on" : "seg"} onClick={() => { setContrast(c.v); apply("contrast", c.v === "high" ? "high" : null); }}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="note">Высокая контрастность убирает прозрачность и усиливает цвета текста и границ. Настройки сохраняются на этом устройстве.</p>
    </>
  );
}
