"use client";

import { useState } from "react";
import { Baby, Check, ChevronDown, ClipboardCheck, Droplets, FileText, Pill, Shirt, Smartphone, TriangleAlert, type LucideIcon } from "lucide-react";
import { CHECKLIST, KEY_ITEMS, TOTAL_ITEMS, type CheckGroup } from "@/lib/checklist";
import { usePref } from "@/lib/use-pref";

const ICON: Record<CheckGroup["icon"], LucideIcon> = { docs: FileText, health: Pill, water: Droplets, phone: Smartphone, clothes: Shirt, family: Baby };

// Памятка «что взять с собой»; отметки хранятся только на устройстве. autoOpen — раскрывать, когда построен маршрут.
export default function Checklist({ autoOpen }: { autoOpen: boolean }) {
  const [raw, setRaw] = usePref("checklist", "[]");
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? autoOpen;
  let checked: string[] = [];
  try { checked = JSON.parse(raw); } catch {}
  const set = new Set(checked);
  const toggle = (id: string) => {
    // читаем актуальное значение из хранилища, чтобы быстрые клики не затирали друг друга
    let fresh: string[] = [];
    try { fresh = JSON.parse(localStorage.getItem("checklist") ?? "[]"); } catch {}
    const next = new Set(fresh);
    if (next.has(id)) next.delete(id); else next.add(id);
    setRaw(JSON.stringify([...next]));
  };

  return (
    <div className="card checklist">
      <button className="cl-head" onClick={() => setManual(!open)} aria-expanded={open}>
        <span className="ico ico-green"><ClipboardCheck size={18} /></span>
        <span className="cl-title"><b>Что взять с собой</b><small>Собрано {Math.min(set.size, TOTAL_ITEMS)} из {TOTAL_ITEMS}</small></span>
        <ChevronDown size={18} className={open ? "cl-chev up" : "cl-chev"} />
      </button>

      {!open && (
        <p className="cl-quick">Главное: {KEY_ITEMS.map((i) => i.short ?? i.text.toLowerCase()).join(", ")}.</p>
      )}

      {open && (
        <div className="cl-body">
          <p className="warn"><TriangleAlert size={16} style={{ flex: "none" }} />Если слышите сигнал тревоги, не тратьте время на сборы: берите документы, телефон и воду и идите в укрытие. Полный список нужен, чтобы подготовиться заранее.</p>
          {CHECKLIST.map((g) => {
            const Icon = ICON[g.icon];
            return (
              <section key={g.id} className="cl-group">
                <h4><Icon size={15} />{g.title}</h4>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <button className={set.has(it.id) ? "cl-item on" : "cl-item"} role="checkbox" aria-checked={set.has(it.id)} onClick={() => toggle(it.id)}>
                        <span className="cl-box">{set.has(it.id) && <Check size={14} strokeWidth={3} />}</span>
                        <span>{it.text}{it.key && <em>важно</em>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="note" style={{ margin: "8px 0 0" }}>Список составлен по общим рекомендациям МЧС России. Не берите лишнего: одной сумки или рюкзака на человека достаточно.</p>
        </div>
      )}
    </div>
  );
}
