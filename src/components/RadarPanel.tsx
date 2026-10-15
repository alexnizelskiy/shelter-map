"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { usePref } from "@/lib/use-pref";
import { RADAR_REGION_DEFAULT } from "@/lib/radar-const";
import { RowsSkeleton } from "./skeletons";

type Item = { id: number; at: string; text: string; region: string };
type Data = { enabled: boolean; posts: Item[]; updatedAt: number | null; stale?: boolean; error?: boolean };

const memory = new Map<string, Data>(); // последняя загрузка по регионам: при возврате в раздел лента видна сразу

const dayLabel = (d: Date) => {
  const today = new Date(); const y = new Date(today.getTime() - 86400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return same(d, today) ? "сегодня" : same(d, y) ? "вчера" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
};
const ago = (d: Date) => {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  return m < 1 ? "только что" : m < 60 ? `${m} мин назад` : `${Math.floor(m / 60)} ч ${m % 60} мин назад`;
};

// Раздел «Радар»: сообщения за последние сутки из открытого канала. Источник указан, подпись канала не копируется.
export default function RadarPanel({ shown = true }: { shown?: boolean }) {
  const [mode, setMode] = usePref("radar-region", "region"); // region | all
  const region = mode === "all" ? "" : RADAR_REGION_DEFAULT;
  const key = region || "all";
  const [data, setData] = useState<Data | null>(() => memory.get(key) ?? null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/radar${region ? `?region=${encodeURIComponent(region)}` : ""}`, { cache: "no-store" });
      const j = (await r.json()) as Data;
      if (!alive.current) return;
      memory.set(key, j);
      setData(j);
    } catch { if (alive.current && !memory.get(key)) setData({ enabled: true, posts: [], updatedAt: null, error: true }); }
    finally { if (alive.current) setBusy(false); }
  }, [region, key]);

  // при смене региона показываем сохранённое сразу, затем обновляем; пока раздел открыт и вкладка видна — раз в минуту
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!shown) return;
    const first = setTimeout(load, 0);
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [shown, load]);
  const view = data ?? memory.get(key) ?? null;

  return (
    <div className="radar">
      <div className="large-title"><h2>Радар</h2>
        <button className="icon-btn" aria-label="Обновить" onClick={load} disabled={busy}><RefreshCw size={16} className={busy ? "rotating" : ""} /></button>
      </div>
      <div className="card radar-warn" role="note">
        <TriangleAlert size={18} />
        <p><b>Неофициальная информация.</b> Сообщения из открытого канала, мы их не проверяем и не гарантируем точность. Официальные оповещения: МЧС, сирены и сообщения на телефон. Следуйте указаниям экстренных служб.</p>
      </div>
      <div className="segmented two" role="group" aria-label="Регион">
        <button className={mode !== "all" ? "seg on" : "seg"} onClick={() => setMode("region")} aria-pressed={mode !== "all"}>{RADAR_REGION_DEFAULT}</button>
        <button className={mode === "all" ? "seg on" : "seg"} onClick={() => setMode("all")} aria-pressed={mode === "all"}>Вся Россия</button>
      </div>

      {!view && <RowsSkeleton n={5} />}
      {view && !view.enabled && <p className="note">Раздел временно отключён.</p>}
      {view?.enabled && view.posts.length === 0 && (
        <p className="note">{view.error ? "Не удалось загрузить сообщения. Попробуйте позже." : "За последние сутки сообщений нет."}</p>
      )}
      {view?.enabled && view.stale && view.posts.length > 0 && <p className="note">Обновить ленту не удалось, показаны последние сохранённые сообщения.</p>}
      {view?.enabled && view.posts.length > 0 && (
        <ul className="radar-list">
          {view.posts.map((p) => {
            const d = new Date(p.at);
            return (
              <li key={p.id} className="card radar-post">
                <div className="radar-meta">
                  <b>{d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b>
                  <span>{dayLabel(d)} · {ago(d)}</span>
                </div>
                <p>{p.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
