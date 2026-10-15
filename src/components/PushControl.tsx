"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { usePref } from "@/lib/use-pref";
import { PUSH_ASKED_KEY, PUSH_KEY, baseState, disablePush, enablePush, parseChoice, syncPush, type PushChoice, type PushState } from "@/lib/push-client";
import Spinner from "./Spinner";

// Состояние уведомлений «Радара» для интерфейса: включены ли они и с каким выбором
export function usePush(regionName: string, city: string) {
  const [raw] = usePref(PUSH_KEY, "");
  const choice = parseChoice(raw);
  const [base, setBase] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setBase(baseState()); syncPush(); }, 0);
    return () => clearTimeout(t);
  }, []);
  const state: PushState = choice && base === "off" ? "on" : base;

  const enable = async (c: PushChoice) => {
    setBusy(true); setError("");
    const r = await enablePush(c, `/${city}?radar=1`);
    setBusy(false);
    if (r.ok) return true;
    setError(r.reason === "denied" ? "Уведомления не разрешены. Разрешите их для этого сайта в настройках браузера." : r.reason === "unsupported" ? "Браузер не поддерживает уведомления." : "Не удалось включить уведомления. Попробуйте позже.");
    if (r.reason === "denied") setBase("denied");
    return false;
  };
  const disable = async () => { setBusy(true); await disablePush(); setBusy(false); };
  return { state, choice, busy, error, enable, disable, regionName };
}

type P = ReturnType<typeof usePush>;

// Выбор и управление: включить (регион / вся Россия), сменить выбор, отключить
export function PushPanel({ p }: { p: P }) {
  const { state, choice, busy, error, enable, disable, regionName } = p;
  if (state === "unsupported") return <p className="note">Этот браузер не поддерживает уведомления.</p>;
  if (state === "ios-install") return <p className="note">На iPhone уведомления работают в установленном приложении: нажмите «Поделиться» → «На экран «Домой»», откройте «Опору» с экрана и включите уведомления здесь.</p>;
  if (state === "denied") return <p className="note">Уведомления запрещены для этого сайта. Разрешите их в настройках браузера и вернитесь сюда.</p>;
  const labels: [PushChoice, string][] = [[{ scope: "region", region: regionName }, regionName], [{ scope: "all", region: "" }, "Вся Россия"]];
  return (
    <div className="push-panel">
      {state === "on" && choice && <p className="note"><BellRing size={14} style={{ verticalAlign: "-2px" }} /> Включены: <b>{choice.scope === "all" ? "вся Россия" : choice.region || regionName}</b></p>}
      <div className="segmented two" role="group" aria-label="Какие уведомления присылать">
        {labels.map(([c, label]) => {
          const on = state === "on" && choice && choice.scope === c.scope;
          return <button key={label} className={on ? "seg on" : "seg"} disabled={busy} aria-pressed={Boolean(on)} onClick={() => enable(c)}>{busy ? <Spinner size={14} /> : null}{label}</button>;
        })}
      </div>
      {state === "off" && <p className="note">Выберите, о чём присылать новые сообщения радара.</p>}
      {state === "on" && <button className="btn-plain" onClick={disable} disabled={busy}><BellOff size={15} /> Отключить уведомления</button>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

// Колокольчик в шапке «Радара»: открывает панель настройки
export function PushBell({ p }: { p: P }) {
  const [open, setOpen] = useState(false);
  if (p.state === "unsupported") return null;
  return (
    <>
      <button className={p.state === "on" ? "icon-btn bell on" : "icon-btn bell"} aria-label="Уведомления радара" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {p.state === "on" ? <BellRing size={16} /> : <Bell size={16} />}
      </button>
      {open && <div className="card push-pop" role="dialog" aria-label="Уведомления радара"><h3>Уведомления радара</h3><PushPanel p={p} /></div>}
    </>
  );
}

// Предложение при первом заходе в «Радар»: один раз, потом остаётся только колокольчик и настройки
export function PushOffer({ p }: { p: P }) {
  const [asked, setAsked] = usePref(PUSH_ASKED_KEY, "");
  if (asked || p.state !== "off") return null;
  const choose = async (c: PushChoice) => { setAsked("1"); await p.enable(c); };
  return (
    <div className="card push-offer" role="region" aria-label="Предложение уведомлений">
      <b>Присылать уведомления радара?</b>
      <p className="note">Новые сообщения появятся на экране телефона, даже когда сайт закрыт. Включить или отключить можно потом в настройках.</p>
      <div className="push-offer-btns">
        <button className="btn" disabled={p.busy} onClick={() => choose({ scope: "region", region: p.regionName })}>{p.regionName}</button>
        <button className="btn btn-ghost-wide" disabled={p.busy} onClick={() => choose({ scope: "all", region: "" })}>Вся Россия</button>
      </div>
      <button className="link-btn" onClick={() => setAsked("1")}>Не сейчас</button>
      {p.error && <p className="err" role="alert">{p.error}</p>}
    </div>
  );
}

// Карточка в настройках: включить, сменить выбор или отключить уведомления радара
export function PushSettings({ regionName, city }: { regionName: string; city: string }) {
  const p = usePush(regionName, city);
  if (p.state === "unsupported") return null;
  return (
    <div className="card push-settings">
      <h3><Bell size={16} /> Уведомления радара</h3>
      <PushPanel p={p} />
    </div>
  );
}
