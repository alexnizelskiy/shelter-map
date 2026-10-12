"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Send, Siren, Smartphone } from "lucide-react";
import Spinner from "./Spinner";
import BrandLogo from "./BrandLogo";

type TgWebApp = { initData?: string; ready?: () => void; expand?: () => void; openTelegramLink?: (u: string) => void };
type State =
  | { t: "loading" }
  | { t: "browser" }
  | { t: "need"; link: string; urgent: boolean }
  | { t: "error"; text: string; urgent: boolean };

const webApp = (): TgWebApp | undefined => (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

// Вход в мини-приложение Telegram: проверяем подписку на канал и пускаем на карту
export default function TgGate() {
  const router = useRouter();
  const [state, setState] = useState<State>({ t: "loading" });
  const [busy, setBusy] = useState(false);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT;

  const check = useCallback(async () => {
    const wa = webApp();
    const initData = wa?.initData ?? "";
    if (!initData) { setState({ t: "browser" }); return; }
    try {
      const r = await fetch("/api/tg/gate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { router.replace("/"); return; }
      if (j.reason === "not_subscribed") setState({ t: "need", link: j.link ?? "", urgent: j.urgent !== false });
      else setState({ t: "error", text: "Не удалось подтвердить вход. Откройте мини-приложение заново через бота.", urgent: true });
    } catch {
      setState({ t: "error", text: "Нет соединения. Проверьте сеть и повторите.", urgent: true });
    }
  }, [router]);

  useEffect(() => {
    const run = () => { webApp()?.ready?.(); webApp()?.expand?.(); check(); };
    const src = "https://telegram.org/js/telegram-web-app.js";
    const have = document.querySelector(`script[src="${src}"]`);
    if (have && webApp()) { const t = setTimeout(run, 0); return () => clearTimeout(t); }
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = run; s.onerror = () => setState({ t: "browser" });
    document.head.appendChild(s);
  }, [check]);

  const recheck = async () => { setBusy(true); await check(); setBusy(false); };
  const openChannel = (link: string) => { const w = webApp(); if (w?.openTelegramLink) w.openTelegramLink(link); else window.open(link, "_blank"); };

  return (
    <main className="gate">
      <div className="gate-brand"><BrandLogo height={46} /></div>

      {state.t === "loading" && <div className="alarm-wait"><Spinner size={22} />Проверяем доступ…</div>}

      {state.t === "browser" && (
        <div className="card gate-card">
          <span className="ico ico-blue"><Smartphone size={20} /></span>
          <h1>Откройте Опору через бота</h1>
          <p className="note" style={{ margin: 0 }}>Эта страница работает внутри Telegram. Обычный сайт открывается без бота.</p>
          {bot && <a className="btn" href={`https://t.me/${bot}`}><Send size={16} />Открыть бота в Telegram</a>}
          <Link className="btn btn-ghost-wide" href="/">Открыть сайт</Link>
        </div>
      )}

      {state.t === "need" && (
        <div className="card gate-card">
          <span className="ico ico-green"><BellRing size={20} /></span>
          <h1>Подпишитесь на канал</h1>
          <p className="note" style={{ margin: 0 }}>Чтобы открыть карту, нужна подписка на наш канал. Это бесплатно. Подписались? Нажмите «Проверить».</p>
          {state.link && <button className="btn" onClick={() => openChannel(state.link)}><Send size={16} />Подписаться на канал</button>}
          <button className="btn btn-ghost-wide" disabled={busy} onClick={recheck}>{busy ? <Spinner size={16} /> : <CheckCircle2 size={16} />}Я подписался — проверить</button>
          {state.urgent && <Link className="alarm-btn" href="/alarm" style={{ marginTop: 4 }}><Siren size={18} />Срочно — режим «Тревога»</Link>}
        </div>
      )}

      {state.t === "error" && (
        <div className="card gate-card">
          <h1>Не получилось</h1>
          <p className="err" style={{ margin: 0 }}>{state.text}</p>
          <button className="btn" onClick={recheck} disabled={busy}>{busy && <Spinner size={16} />}Повторить</button>
          {state.urgent && <Link className="alarm-btn" href="/alarm"><Siren size={18} />Режим «Тревога»</Link>}
        </div>
      )}
    </main>
  );
}
