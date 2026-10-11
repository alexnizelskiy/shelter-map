"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, MapPin, X } from "lucide-react";
import { usePref } from "@/lib/use-pref";
import Spinner from "./Spinner";
import { CHOICE_KEY, useRecent, type PlaceResult } from "./CitySearch";

type State = { kind: "detecting" } | { kind: "found"; place: PlaceResult; precise: boolean } | { kind: "none" };

// Определяем город по IP (без запроса разрешений), спрашиваем «верно?» и запоминаем выбор.
export default function LocationPrompt({ current, onChooseOther }: { current?: string; onChooseOther: () => void }) {
  const router = useRouter();
  const [choice, setChoice] = usePref(CHOICE_KEY, "");
  const [state, setState] = useState<State>({ kind: "detecting" });
  // на сервере и при гидрации ничего не рисуем, чтобы вернувшийся пользователь не видел мигание
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [hidden, setHidden] = useState(false);
  const recent = useRecent();

  // уже выбирали город: на главной сразу ведём туда
  useEffect(() => {
    if (choice && !current) router.replace(`/${choice}`);
  }, [choice, current, router]);

  useEffect(() => {
    if (choice) return;
    let alive = true;
    fetch("/api/locate")
      .then((r) => r.json())
      .then((j) => { if (alive) setState(j.found ? { kind: "found", place: j.place, precise: false } : { kind: "none" }); })
      .catch(() => alive && setState({ kind: "none" }));
    return () => { alive = false; };
  }, [choice]);

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

  if (!mounted || choice || hidden) return null;

  const confirm = (place: PlaceResult) => {
    setChoice(place.slug);
    recent.add(place);
    setHidden(true);
    if (place.slug !== current) router.push(`/${place.slug}`);
  };

  return (
    <div className="loc-prompt glass" role="dialog" aria-label="Подтверждение местоположения">
      <button className="icon-btn" aria-label="Закрыть" onClick={() => setHidden(true)}><X size={16} /></button>
      {state.kind === "detecting" && <p className="loc-text"><Spinner size={18} />&nbsp;Определяем ваше местоположение…</p>}
      {state.kind === "found" && (
        <>
          <span className="ico ico-green"><MapPin size={20} /></span>
          <div className="loc-body">
            <p className="loc-text"><b>{state.place.name}</b>{state.place.region && <small>{state.place.region}</small>}</p>
            <p className="note" style={{ margin: 0 }}>{state.precise ? "По вашей геопозиции." : "Определили по сети."} Это верно?</p>
            <div className="loc-btns">
              <button className="btn" onClick={() => confirm(state.place)}>Да, верно</button>
              <button className="btn btn-ghost-wide" onClick={() => { setHidden(true); onChooseOther(); }}>Другой город</button>
            </div>
            {!state.precise && <button className="link-btn" onClick={preciseLocate}>Определить точнее по геопозиции</button>}
          </div>
        </>
      )}
      {state.kind === "none" && (
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
