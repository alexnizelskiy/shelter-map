"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, HardDriveDownload, RefreshCw, Smartphone } from "lucide-react";
import Spinner from "./Spinner";

type Saved = { slug: string; name: string; n: number; at: number };

const readSaved = (): Saved[] => {
  const out: Saved[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith("alarm-cache:")) continue;
      const c = JSON.parse(localStorage.getItem(k) ?? "null");
      if (c?.shelters) out.push({ slug: k.slice(12), name: c.name ?? k.slice(12), n: c.shelters.length, at: c.at ?? 0 });
    }
  } catch {}
  return out;
};

// Установка на экран и состояние офлайн-режима: что сохранено на устройстве
export default function OfflineSettings({ citySlug }: { citySlug: string }) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [worker, setWorker] = useState<"yes" | "no" | "off">("no");
  const [canInstall, setCanInstall] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setSaved(readSaved()), []);

  useEffect(() => {
    const t = setTimeout(() => {
      refresh();
      setWorker(!("serviceWorker" in navigator) ? "off" : navigator.serviceWorker.controller ? "yes" : "no");
      setStandalone(window.matchMedia("(display-mode: standalone)").matches);
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
      setCanInstall(Boolean((window as unknown as { __installPrompt?: Event }).__installPrompt));
    }, 0);
    const onAvail = () => setCanInstall(true);
    window.addEventListener("install-available", onAvail);
    return () => { clearTimeout(t); window.removeEventListener("install-available", onAvail); };
  }, [refresh]);

  const install = async () => {
    const e = (window as unknown as { __installPrompt?: Event & { prompt?: () => Promise<void> } }).__installPrompt;
    await e?.prompt?.();
    setCanInstall(false);
  };

  const update = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/shelters?city=${citySlug}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) localStorage.setItem(`alarm-cache:${citySlug}`, JSON.stringify({ name: j.city.name, shelters: j.shelters, at: j.at }));
    } catch {} finally { setBusy(false); refresh(); }
  };

  return (
    <div className="card offline-card">
      <ul className="acc-list">
        <li><HardDriveDownload size={16} /><span>Приложение сохранено для работы без сети</span><b className={`tri ${worker === "yes" ? "yes" : "unk"}`}>{worker === "yes" ? "Да" : worker === "off" ? "Не поддерживается" : "После обновления страницы"}</b></li>
        {saved.length === 0 && <li><Download size={16} /><span>Список укрытий на устройстве</span><b className="tri unk">Нет</b></li>}
        {saved.map((s) => (
          <li key={s.slug}><CheckCircle2 size={16} /><span>{s.name}: {s.n.toLocaleString("ru-RU")} точек</span><b className="tri yes">{s.at ? new Date(s.at).toLocaleDateString("ru-RU") : "сохранено"}</b></li>
        ))}
      </ul>
      <div className="route-btns" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost-wide" onClick={update} disabled={busy}>{busy ? <Spinner size={16} /> : <RefreshCw size={16} />}Обновить список</button>
        {canInstall && !standalone && <button className="btn" onClick={install}><Smartphone size={16} />Установить</button>}
      </div>
      {ios && !standalone && <p className="note" style={{ margin: "8px 0 0" }}>На iPhone: в Safari нажмите «Поделиться», затем «На экран «Домой»».</p>}
      {standalone && <p className="note" style={{ margin: "8px 0 0" }}>Приложение уже установлено на экран.</p>}
      <p className="note" style={{ margin: "8px 0 0" }}>Без сети работает «Тревога»: расстояние и направление до ближайшего укрытия по сохранённому списку и компасу. Карта и маршруты требуют интернета.</p>
    </div>
  );
}
