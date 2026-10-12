"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type P = { id: number; total: number; sent: number; failed: number; blocked: number; pending: number; status: string };

// Отправляет рассылку партиями, пока страница открыта. Если закрыть вкладку, оставшиеся получатели ждут в очереди: «Продолжить» запустит отправку снова.
export default function BroadcastRunner({ id, initial, autostart }: { id: number; initial: P; autostart: boolean }) {
  const [p, setP] = useState<P>(initial);
  const [running, setRunning] = useState(autostart && initial.status === "sending");
  const [note, setNote] = useState("");
  const alive = useRef(true);

  const step = useCallback(async (cancel = false) => {
    const r = await fetch("/api/admin/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, cancel }) });
    if (!r.ok) throw new Error(r.status === 403 ? "Сессия админа истекла: войдите заново" : `Ошибка ${r.status}`);
    return (await r.json()) as { progress: P | null; retry: boolean };
  }, [id]);

  useEffect(() => {
    alive.current = true;
    if (!running) return;
    (async () => {
      while (alive.current) {
        try {
          const r = await step();
          if (!alive.current) return;
          if (r.progress) setP(r.progress);
          if (!r.progress || r.progress.pending === 0 || r.progress.status !== "sending") { setRunning(false); return; }
          if (r.retry) { setNote("Мессенджер просит подождать, продолжу через несколько секунд…"); await new Promise((res) => setTimeout(res, 6000)); setNote(""); }
        } catch (e) {
          setNote(e instanceof Error ? e.message : "Сбой связи");
          setRunning(false);
          return;
        }
      }
    })();
    return () => { alive.current = false; };
  }, [running, step]);

  const cancel = async () => {
    alive.current = false;
    setRunning(false);
    try { const r = await step(true); if (r.progress) setP(r.progress); } catch (e) { setNote(e instanceof Error ? e.message : "Сбой связи"); }
  };

  const done = p.sent + p.failed + p.blocked;
  const pct = p.total ? Math.round((done / p.total) * 100) : 100;
  return (
    <div className="adm-card" style={{ gap: 8 }}>
      <div className="adm-title"><strong>Рассылка №{p.id}</strong><span className="chip">{p.status === "sending" ? (running ? "идёт отправка" : "на паузе") : p.status === "done" ? "завершена" : "отменена"}</span></div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      <p className="note" style={{ margin: 0 }}>Доставлено: {p.sent} · заблокировали бота: {p.blocked} · ошибок: {p.failed} · в очереди: {p.pending} · всего: {p.total}</p>
      {note && <p className="warn" role="status" style={{ margin: 0 }}>{note}</p>}
      {p.status === "sending" && (
        <div className="adm-inline">
          {!running && <button className="primary" style={{ width: "auto", padding: "10px 18px" }} onClick={() => setRunning(true)}>Продолжить отправку</button>}
          <button className="btn-plain btn-danger" onClick={cancel}>Отменить оставшиеся</button>
        </div>
      )}
    </div>
  );
}
