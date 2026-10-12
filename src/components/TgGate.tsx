"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Send, Siren, Smartphone } from "lucide-react";
import Spinner from "./Spinner";
import BrandLogo from "./BrandLogo";

type Platform = "telegram" | "max";
type WebApp = { initData?: string; initDataUnsafe?: { start_param?: string }; ready?: () => void; expand?: () => void; openTelegramLink?: (u: string) => void; openLink?: (u: string) => void };
type State =
  | { t: "loading" }
  | { t: "browser" }
  | { t: "need"; link: string; urgent: boolean }
  | { t: "error"; text: string; urgent: boolean };

// Настройки двух мессенджеров: скрипт моста, где лежит объект приложения, адрес проверки и название
const CONF = {
  telegram: {
    name: "Telegram",
    script: "https://telegram.org/js/telegram-web-app.js",
    gate: "/api/tg/gate",
    channel: "tg",
    app: (): WebApp | undefined => (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp,
    botLink: () => (process.env.NEXT_PUBLIC_TELEGRAM_BOT ? `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT}` : ""),
  },
  max: {
    name: "MAX",
    script: "https://st.max.ru/js/max-web-app.js",
    gate: "/api/max/gate",
    channel: "max",
    app: (): WebApp | undefined => (window as unknown as { WebApp?: WebApp }).WebApp,
    botLink: () => (process.env.NEXT_PUBLIC_MAX_BOT ? `https://max.ru/${process.env.NEXT_PUBLIC_MAX_BOT.replace(/^@/, "")}` : ""),
  },
} as const;

// Вход в мини-приложение Telegram или MAX: проверяем подписку на канал и пускаем на карту
export default function TgGate({ platform = "telegram" }: { platform?: Platform }) {
  const conf = CONF[platform];
  const router = useRouter();
  const [state, setState] = useState<State>({ t: "loading" });
  const [busy, setBusy] = useState(false);
  const botLink = conf.botLink();

  const check = useCallback(async () => {
    const wa = conf.app();
    const initData = wa?.initData ?? "";
    if (!initData) { setState({ t: "browser" }); return; }
    try {
      sessionStorage.setItem("opora_ch", conf.channel);
      const sp = wa?.initDataUnsafe?.start_param; // метка ссылки, с которой открыли мини-приложение
      if (sp) sessionStorage.setItem("opora_src", sp);
    } catch { /* приватный режим */ }
    try {
      const r = await fetch(conf.gate, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, startParam: wa?.initDataUnsafe?.start_param ?? "" }) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { router.replace("/"); return; }
      if (j.reason === "not_subscribed") setState({ t: "need", link: j.link ?? "", urgent: j.urgent !== false });
      else setState({ t: "error", text: "Не удалось подтвердить вход. Откройте мини-приложение заново через бота.", urgent: true });
    } catch {
      setState({ t: "error", text: "Нет соединения. Проверьте сеть и повторите.", urgent: true });
    }
  }, [router, conf]);

  useEffect(() => {
    const run = () => { conf.app()?.ready?.(); conf.app()?.expand?.(); check(); };
    const src = conf.script;
    const have = document.querySelector(`script[src="${src}"]`);
    if (have && conf.app()) { const t = setTimeout(run, 0); return () => clearTimeout(t); }
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = run; s.onerror = () => setState({ t: "browser" });
    document.head.appendChild(s);
  }, [check, conf]);

  const recheck = async () => { setBusy(true); await check(); setBusy(false); };
  const openChannel = (link: string) => {
    const w = conf.app();
    if (platform === "telegram" && w?.openTelegramLink && link.includes("t.me")) w.openTelegramLink(link);
    else if (w?.openLink) w.openLink(link);
    else window.open(link, "_blank");
  };

  return (
    <main className="gate">
      <div className="gate-brand"><BrandLogo height={46} /></div>

      {state.t === "loading" && <div className="alarm-wait"><Spinner size={22} />Проверяем доступ…</div>}

      {state.t === "browser" && (
        <div className="card gate-card">
          <span className="ico ico-blue"><Smartphone size={20} /></span>
          <h1>Откройте Опору через бота</h1>
          <p className="note" style={{ margin: 0 }}>Эта страница работает внутри {conf.name}. Обычный сайт открывается без бота.</p>
          {botLink && <a className="btn" href={botLink}><Send size={16} />Открыть бота в {conf.name}</a>}
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
