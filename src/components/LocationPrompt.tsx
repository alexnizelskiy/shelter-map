"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, MapPin, X } from "lucide-react";
import { usePref } from "@/lib/use-pref";
import Spinner from "./Spinner";
import { CHOICE_KEY, CONFIRMED_KEY, useRecent, type PlaceResult } from "./CitySearch";

type State = { kind: "detecting" } | { kind: "found"; place: PlaceResult; precise: boolean } | { kind: "none" };

// Город запоминается в localStorage и больше не спрашивается:
// · выбор через поиск, список на главной или подтверждение здесь сохраняют город (CHOICE_KEY) и отметку «уже отвечали» (CONFIRMED_KEY);
// · на странице города открытый вопрос «Где вы находитесь?» не показываем: человек уже выбрал место. Спрашиваем один раз, только если по сети
//   определился другой город («Вы в Таганроге? Перейти / Остаться»), и ответ сохраняется;
// · закрытие окна крестиком тоже считается ответом.
export default function LocationPrompt({ current, currentName, onChooseOther }: { current?: string; currentName?: string; onChooseOther: () => void }) {
  const router = useRouter();
  const [choice, setChoice] = usePref(CHOICE_KEY, "");
  const [confirmed, setConfirmed] = usePref(CONFIRMED_KEY, "");
  const [state, setState] = useState<State>({ kind: "detecting" });
  // на сервере и при гидрации ничего не рисуем, чтобы вернувшийся пользователь не видел мигание
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [hidden, setHidden] = useState(false);
  const recent = useRecent();
  const [decided, setDecided] = useState(false); // город выбран прямо здесь: автопереход «в сохранённый город» не нужен

  // уже выбирали город: на главной ведём туда, но один раз за сессию (чтобы на главную всё же можно было вернуться)
  useEffect(() => {
    if (!choice || current || decided) return;
    try { if (sessionStorage.getItem("home-redirected")) return; sessionStorage.setItem("home-redirected", "1"); } catch { /* приватный режим */ }
    router.replace(`/${choice}`);
  }, [choice, current, decided, router]);

  // на странице города без сохранённого выбора запоминаем её как выбранную (человек пришёл сюда сам или по ссылке)
  useEffect(() => {
    if (current && !choice && mounted) setChoice(current);
  }, [current, choice, mounted, setChoice]);

  const needDetect = mounted && !confirmed;
  useEffect(() => {
    if (!needDetect) return;
    let alive = true;
    fetch("/api/locate")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.found) {
          // на странице города не переспрашиваем: сохраняем её и больше не беспокоим
          if (current) setConfirmed("1");
          setState({ kind: "none" });
          return;
        }
        if (current && j.place.slug === current) { setConfirmed("1"); setHidden(true); return; } // всё совпало: тихо запоминаем
        setState({ kind: "found", place: j.place, precise: false });
      })
      .catch(() => { if (alive) { if (current) setConfirmed("1"); setState({ kind: "none" }); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needDetect]);

  const preciseLocate = () => {
    setState({ kind: "detecting" });
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const r = await fetch(`/api/places?near=${p.coords.latitude},${p.coords.longitude}`);
          const j = await r.json();
          setState(j.results?.[0] ? { kind: "found", place: j.results[0], precise: true } : { kind: "none" });
        } catch { setState({ kind: "none" }); }
      },
      () => setState({ kind: "none" }),
      { timeout: 10000 },
    );
  };

  // на странице города окно показываем, только когда нашёлся другой город; на главной — всегда, пока человек не ответил
  if (!mounted) return null;
  if (confirmed || hidden) return null;
  if (current && state.kind !== "found") return null;

  const answer = (slug: string) => { setDecided(true); setChoice(slug); setConfirmed("1"); setHidden(true); };
  const confirm = (place: PlaceResult) => {
    setDecided(true); setChoice(place.slug); setConfirmed("1"); setHidden(true);
    recent.add(place);
    if (place.slug !== current) router.push(`/${place.slug}`);
  };
  const close = () => { setDecided(true); if (current && !choice) setChoice(current); setConfirmed("1"); setHidden(true); };

  return (
    <div className="loc-prompt glass" role="dialog" aria-label="Подтверждение местоположения">
      <button className="icon-btn" aria-label="Закрыть" onClick={close}><X size={16} /></button>
      {state.kind === "detecting" && <p className="loc-text"><Spinner size={18} />&nbsp;Определяем ваше местоположение…</p>}
      {state.kind === "found" && (
        <>
          <span className="ico ico-green"><MapPin size={20} /></span>
          <div className="loc-body">
            <p className="loc-text"><b>{state.place.name}</b>{state.place.region && <small>{state.place.region}</small>}</p>
            <p className="note" style={{ margin: 0 }}>{state.precise ? "По вашей геопозиции." : "Определили по сети."} {current ? "Перейти к этому городу?" : "Это верно?"}</p>
            <div className="loc-btns">
              <button className="btn" onClick={() => confirm(state.place)}>{current ? "Да, перейти" : "Да, верно"}</button>
              {current
                ? <button className="btn btn-ghost-wide" onClick={() => answer(current)}>Остаться{currentName ? `: ${currentName}` : ""}</button>
                : <button className="btn btn-ghost-wide" onClick={() => { setHidden(true); onChooseOther(); }}>Другой город</button>}
            </div>
            {!state.precise && <button className="link-btn" onClick={preciseLocate}>Определить точнее по геопозиции</button>}
          </div>
        </>
      )}
      {state.kind === "none" && !current && (
        <div className="loc-body">
          <p className="loc-text"><b>Где вы находитесь?</b></p>
          <p className="note" style={{ margin: 0 }}>Не удалось определить автоматически.</p>
          <div className="loc-btns">
            <button className="btn" onClick={preciseLocate}><LocateFixed size={16} />По геопозиции</button>
            <button className="btn btn-ghost-wide" onClick={() => { setHidden(true); onChooseOther(); }}>Выбрать город</button>
          </div>
        </div>
      )}
    </div>
  );
}
