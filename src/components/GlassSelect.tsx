"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type Option<T extends string> = { value: T; label: string; hint?: string };

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label?: string;
};

// Собственный выпадающий список в стиле Liquid Glass вместо системного <select>.
export default function GlassSelect<T extends string>({ value, options, onChange, label }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => setRect(btn.current!.getBoundingClientRect());
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const choose = (v: T) => { onChange(v); setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); return; }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(options[active].value); }
  };

  // Открываем вверх, если снизу мало места
  const up = rect ? window.innerHeight - rect.bottom < Math.min(280, options.length * 52 + 16) && rect.top > window.innerHeight - rect.bottom : false;

  return (
    <>
      <button
        ref={btn} type="button" className={open ? "gs-btn open" : "gs-btn"} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        aria-label={label} onClick={() => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen((v) => !v); }} onKeyDown={onKey}
      >
        <span className="gs-label">{current?.label}</span>
        <ChevronDown size={18} className="gs-chev" />
      </button>
      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={pop} id={id} role="listbox" className="gs-pop glass"
            style={{ left: rect.left, width: rect.width, ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) }}
          >
            {options.map((o, i) => (
              <div
                key={o.value} role="option" aria-selected={o.value === value} className={`gs-opt${o.value === value ? " on" : ""}${i === active ? " act" : ""}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o.value)}
              >
                <span className="gs-opt-text"><b>{o.label}</b>{o.hint && <small>{o.hint}</small>}</span>
                {o.value === value && <Check size={17} />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
