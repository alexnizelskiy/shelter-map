"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CornerUpLeft, Flag, LogOut, Send, Smile, Trash2, UserX, Users, X, MapPin, ChevronDown, Clock } from "lucide-react";
import { CHAT_MAX_LEN, REACTIONS } from "@/lib/chat-meta";
import { LEGAL_VERSION } from "@/lib/legal-meta";
import { ChatSkeleton } from "./skeletons";
import Spinner from "./Spinner";

type Msg = {
  id: number; userId: number; name: string; avatar: string | null; moderator: boolean; text: string; at: string;
  reply: { id: number; name: string; text: string } | null;
  reactions: { emoji: string; n: number; mine: boolean }[];
};
type Data = {
  enabled: boolean; reason?: string; code?: string; online?: number; messages: Msg[]; clearHours?: number; nextClearAt?: number | null;
  providers: { telegram: boolean; vk: boolean; yandex: boolean; max: boolean; dev: boolean };
  me: { id: number; name: string; avatar: string | null; banned: boolean } | null;
};

const hue = (id: number) => (id * 47 + 13) % 360;
const time = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const initials = (name: string) => name.replace(/\./g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function Avatar({ name, src, id }: { name: string; src: string | null; id: number }) {
  const [bad, setBad] = useState(false);
  if (src && !bad) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBad(true)} />;
  }
  return <span className="avatar ph" style={{ background: `hsl(${hue(id)} 58% 52%)` }}>{initials(name)}</span>;
}

type Mini = { provider: "telegram" | "max"; initData: string } | null;
const miniApp = (): Mini => {
  const w = window as unknown as { Telegram?: { WebApp?: { initData?: string } }; WebApp?: { initData?: string } };
  if (w.WebApp?.initData) return { provider: "max", initData: w.WebApp.initData };
  if (w.Telegram?.WebApp?.initData) return { provider: "telegram", initData: w.Telegram.WebApp.initData };
  return null;
};
const loadScript = (src: string, onLoad: () => void) => {
  if (document.querySelector(`script[src="${src}"]`)) { onLoad(); return; }
  const s = document.createElement("script");
  s.src = src; s.async = true; s.onload = onLoad;
  document.head.appendChild(s);
};

export default function ChatPanel({ room, cityName, returnPath, onPickCity, shown = true }: { room: string; cityName: string; returnPath: string; onPickCity: () => void; shown?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Msg | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(() => {
    const e = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("login_error") : null;
    return e ? "Не удалось войти. Попробуйте ещё раз или выберите другой способ." : null;
  });
  const [busy, setBusy] = useState(false);
  // согласие хранится в cookie: её читает сервер при входе (в том числе после возврата из внешнего сервиса)
  const [consent, setConsent] = useState(() => typeof document !== "undefined" && document.cookie.includes("chat_consent="));
  const [mini, setMini] = useState<Mini>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const first = useRef(true);
  const tg = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/messages?room=${encodeURIComponent(room)}`, { cache: "no-store" });
      setData(await r.json());
    } catch {}
  }, [room]);

  // опрос раз в 4 секунды, пока вкладка видна и открыт сам чат. Чат остаётся в памяти при переходе в другие разделы:
  // при возврате сообщения уже на месте, сразу подгружаются только новые.
  const shownRef = useRef(shown);
  useEffect(() => { shownRef.current = shown; }, [shown]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => { if (document.visibilityState === "visible" && shownRef.current) load(); }, 4000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load]);
  useEffect(() => { if (!shown) return; const t = setTimeout(load, 0); return () => clearTimeout(t); }, [shown, load]); // вернулись в чат: сразу подгружаем новое

  // мини-приложения: подключаем мосты Telegram и MAX и ищем initData
  useEffect(() => {
    const check = () => setMini(miniApp());
    loadScript("https://telegram.org/js/telegram-web-app.js", check);
    loadScript("https://st.max.ru/js/max-web-app.js", check);
  }, []);

  // виджет Telegram для обычного сайта
  const tgBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
  const needTgWidget = Boolean(data?.providers.telegram && !data?.me && !mini && tgBot && consent);
  useEffect(() => {
    if (!needTgWidget || !tg.current || !tgBot) return;
    const host = tg.current;
    (window as unknown as { onTgAuth?: (u: unknown) => void }).onTgAuth = async (user) => {
      const r = await fetch("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(user) });
      if (r.ok) load(); else setNote("Не удалось войти через Telegram.");
    };
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", tgBot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "16");
    s.setAttribute("data-onauth", "onTgAuth(user)");
    s.setAttribute("data-request-access", "write");
    host.appendChild(s);
    return () => { host.innerHTML = ""; };
  }, [needTgWidget, tgBot, load]);

  // прокрутка вниз при новых сообщениях, если пользователь внизу
  useEffect(() => {
    const el = list.current;
    if (!el || !data) return;
    if (first.current || stick.current) { el.scrollTop = el.scrollHeight; first.current = false; }
  }, [data?.messages.length, data]);

  const onScroll = () => {
    const el = list.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, error: j.error as string | undefined };
  };

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setNote(null);
    const r = await post("/api/chat/messages", { room, text: t, replyTo: reply?.id });
    setBusy(false);
    if (!r.ok) return setNote(r.error ?? "Не удалось отправить.");
    setText(""); setReply(null); stick.current = true;
    load();
  };

  const requireLogin = () => { setNote("Войдите, чтобы ставить реакции и писать."); };
  const react = async (id: number, emoji: string) => {
    if (!data?.me) return requireLogin();
    setPicker(null);
    const r = await post("/api/chat/react", { messageId: id, emoji });
    if (!r.ok) setNote(r.error ?? "Не удалось поставить реакцию.");
    load();
  };
  const report = async (id: number) => {
    if (!data?.me) return requireLogin();
    const r = await post("/api/chat/report", { messageId: id });
    setNote(r.ok ? "Жалоба отправлена модератору. Спасибо!" : r.error ?? "Не удалось отправить жалобу.");
    setActive(null);
  };
  const remove = async (id: number) => { await post("/api/chat/delete", { messageId: id }); setActive(null); load(); };
  const giveConsent = (v: boolean) => {
    setConsent(v);
    document.cookie = v ? `chat_consent=${LEGAL_VERSION}; path=/; max-age=31536000; samesite=lax` : "chat_consent=; path=/; max-age=0";
  };
  const forget = async () => {
    if (!window.confirm("Удалить ваш профиль, все ваши сообщения и реакции в чате? Это нельзя отменить.")) return;
    const r = await post("/api/chat/forget", {});
    setNote(r.ok ? "Профиль удалён." : r.error ?? "Не удалось удалить профиль.");
    load();
  };
  const logout = async () => { await post("/api/auth/logout", {}); load(); };
  const loginMini = async () => {
    if (!mini) return;
    const r = await post("/api/auth/miniapp", mini);
    if (!r.ok) setNote(r.error ?? "Не удалось войти."); else load();
  };
  // Вход через MAX на обычном сайте: создаём код, человек открывает бота по ссылке (или отправляет ему код), бот подтверждает вход,
  // а сайт каждые 2 секунды спрашивает, подтвердили ли.
  const [maxLogin, setMaxLogin] = useState<{ link: string; code: string; minutes: number } | null>(null);
  const startMaxLogin = async () => {
    setNote(null);
    try {
      const r = await fetch("/api/auth/max/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setNote(j.error ?? "Не удалось начать вход через MAX.");
      setMaxLogin({ link: j.link, code: j.code, minutes: j.minutes });
    } catch { setNote("Нет соединения. Попробуйте позже."); }
  };
  useEffect(() => {
    if (!maxLogin) return;
    let alive = true;
    const until = Date.now() + maxLogin.minutes * 60_000;
    const tick = async () => {
      try {
        const r = await fetch("/api/auth/max/poll", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (j.state === "ok") { setMaxLogin(null); load(); return; }
        if (j.state === "expired" || r.status >= 400 || Date.now() > until) { setMaxLogin(null); setNote(j.error ?? "Время входа вышло. Нажмите «MAX» ещё раз."); }
      } catch { /* нет сети: попробуем при следующем опросе */ }
    };
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [maxLogin, load]);
  const devLogin = async () => {
    await post("/api/auth/dev", { name: `Тест Тестов ${Math.floor(Math.random() * 90 + 10)}` });
    load();
  };

  if (!data) return <ChatSkeleton />;

  if (!data.enabled) {
    return (
      <div className="chat" data-shown={shown}>
        <ChatHead online={0} cityName={cityName} onPickCity={onPickCity} />
        <p className="note">{data.reason === "no_db" ? "Чат ещё не подключён: нет базы данных." : data.reason === "error" ? `Чат временно недоступен${data.code ? ` (код: ${data.code})` : ""}.` : "Чат временно отключён модератором."}</p>
      </div>
    );
  }

  const ret = encodeURIComponent(`${returnPath}?chat=1`);
  const p = data.providers;
  const canLogin = p.yandex || p.vk || p.max || p.telegram || p.dev;

  return (
    <div className="chat" data-shown={shown} onClick={() => { setActive(null); setPicker(null); }}>
      <ChatHead online={data.online ?? 0} cityName={cityName} onPickCity={onPickCity} />
      {data.nextClearAt && (
        <p className="chat-clear"><Clock size={13} />Чат очищается раз в {data.clearHours === 24 ? "сутки" : data.clearHours === 48 ? "2 дня" : data.clearHours === 168 ? "неделю" : `${data.clearHours} ч`}. Ближайшая очистка: {new Date(data.nextClearAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
      )}

      <div className="chat-list" ref={list} onScroll={onScroll}>
        {data.messages.length === 0 && <p className="note" style={{ textAlign: "center", marginTop: 24 }}>Здесь пока тихо. Напишите первым, если вы вошли.</p>}
        {data.messages.map((m) => {
          const mine = data.me?.id === m.userId;
          return (
            <div key={m.id} className={mine ? "msg mine" : "msg"}>
              {!mine && <Avatar name={m.name} src={m.avatar} id={m.userId} />}
              <div className="bubble-wrap">
                <div className={active === m.id ? "bubble sel" : "bubble"} onClick={(e) => { e.stopPropagation(); setActive(active === m.id ? null : m.id); setPicker(null); }}>
                  <div className="bubble-head">
                    <b style={{ color: `hsl(${hue(m.userId)} 62% var(--name-l))` }}>{m.name}</b>
                    {m.moderator && <span className="badge-mod">Модератор</span>}
                  </div>
                  {m.reply && (
                    <div className="quote"><CornerUpLeft size={13} /><div><b>{m.reply.name}</b><span>{m.reply.text}</span></div></div>
                  )}
                  <p className="bubble-text">{m.text}<time>{time(m.at)}</time></p>
                </div>
                {m.reactions.length > 0 && (
                  <div className="reacts">
                    {m.reactions.map((r) => (
                      <button key={r.emoji} className={r.mine ? "react on" : "react"} onClick={(e) => { e.stopPropagation(); react(m.id, r.emoji); }}>{r.emoji}<span>{r.n}</span></button>
                    ))}
                  </div>
                )}
                {active === m.id && (
                  <div className="msg-actions" onClick={(e) => e.stopPropagation()}>
                    {data.me ? <button onClick={() => { setReply(m); setActive(null); }}><CornerUpLeft size={15} />Ответить</button> : null}
                    <button onClick={() => setPicker(picker === m.id ? null : m.id)}><Smile size={15} />Реакция</button>
                    {mine ? <button onClick={() => remove(m.id)}><Trash2 size={15} />Удалить</button> : <button onClick={() => report(m.id)}><Flag size={15} />Пожаловаться</button>}
                  </div>
                )}
                {picker === m.id && (
                  <div className="picker" onClick={(e) => e.stopPropagation()}>
                    {REACTIONS.map((e) => <button key={e} onClick={() => react(m.id, e)}>{e}</button>)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {note && <p className="chat-note" role="status">{note}</p>}

      {data.me ? (
        <div className="composer" onClick={(e) => e.stopPropagation()}>
          {reply && (
            <div className="reply-bar"><CornerUpLeft size={14} /><span><b>{reply.name}</b> {reply.text.slice(0, 60)}</span><button aria-label="Отменить ответ" onClick={() => setReply(null)}><X size={14} /></button></div>
          )}
          {data.me.banned ? (
            <p className="note" style={{ margin: 6 }}>Вы не можете писать в чат.</p>
          ) : (
            <div className="composer-row">
              <input
                value={text} maxLength={CHAT_MAX_LEN} placeholder="Сообщение (только текст, без ссылок)" aria-label="Сообщение"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button className="send" aria-label="Отправить" disabled={busy || !text.trim()} onClick={send}>{busy ? <Spinner size={18} /> : <Send size={18} />}</button>
            </div>
          )}
          <div className="who"><Avatar name={data.me.name} src={data.me.avatar} id={data.me.id} /><span>{data.me.name}</span><button onClick={forget}><UserX size={14} />Удалить профиль</button><button onClick={logout}><LogOut size={14} />Выйти</button></div>
        </div>
      ) : (
        <div className="login" onClick={(e) => e.stopPropagation()}>
          {canLogin && (
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => giveConsent(e.target.checked)} />
              <span>Согласен на обработку имени, первой буквы фамилии и аватара на условиях <Link href="/privacy" target="_blank">Политики</Link> и <Link href="/terms" target="_blank">Соглашения</Link>.</span>
            </label>
          )}
          {canLogin ? <p className="login-title">Выполните вход:</p> : <p className="note" style={{ textAlign: "center" }}>Вход пока не настроен администратором.</p>}
          <div className={consent ? "login-btns" : "login-btns locked"} aria-disabled={!consent}>
            {p.yandex && <a className="lb yandex" href={`/api/auth/yandex/start?return=${ret}`}>Яндекс ID</a>}
            {p.vk && <a className="lb vk" href={`/api/auth/vk/start?return=${ret}`}>VK ID</a>}
            {p.max && (mini?.provider === "max" ? <button className="lb max" onClick={loginMini}>MAX</button> : <button className="lb max" onClick={startMaxLogin} disabled={!consent || !!maxLogin}>MAX</button>)}
            {p.telegram && (mini?.provider === "telegram" ? <button className="lb tg" onClick={loginMini}>Telegram</button> : <div className="tg-widget" ref={tg} />)}
            {p.dev && <button className="lb dev" onClick={devLogin}>Тестовый вход</button>}
          </div>
          {maxLogin && (
            <div className="max-wait" role="status">
              <p><Spinner size={16} /> Ждём подтверждения в MAX</p>
              <a className="lb max" href={maxLogin.link} target="_blank" rel="noreferrer">Открыть бота в MAX</a>
              <p className="note">Нажмите «Начать» в боте: вход подтвердится сам. Если бот не отреагировал, отправьте ему сообщение: <b>вход {maxLogin.code}</b></p>
              <button className="link-btn" onClick={() => setMaxLogin(null)}>Отмена</button>
            </div>
          )}
          <p className="login-cap">Читать могут все. Вход нужен, чтобы писать и ставить реакции. Показываем только имя и первую букву фамилии. <Link href="/rules" target="_blank">Правила чата</Link></p>
        </div>
      )}
    </div>
  );
}

function ChatHead({ online, cityName, onPickCity }: { online: number; cityName: string; onPickCity: () => void }) {
  return (
    <div className="chat-head">
      <button className="chip-city btn-like" onClick={onPickCity} aria-label="Выбрать город"><MapPin size={14} /><span className="chip-name">{cityName}</span><ChevronDown size={14} /></button>
      <span className="online" title="Сейчас в чате"><Users size={17} />{online.toLocaleString("ru-RU")}</span>
    </div>
  );
}
