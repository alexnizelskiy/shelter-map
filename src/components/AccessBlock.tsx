"use client";

import { bumpHelp } from "@/lib/my-help";
import { useState } from "react";
import { Accessibility, CheckCircle2, Clock4, Pencil, PawPrint } from "lucide-react";
import GlassSelect from "./GlassSelect";
import Spinner from "./Spinner";
import type { Shelter, Tri } from "@/lib/shelters";

const triLabel = (v: Tri | undefined) => (v === "yes" ? "Да" : v === "no" ? "Нет" : "Нет данных");
const triClass = (v: Tri | undefined) => (v === "yes" ? "yes" : v === "no" ? "no" : "unk");
type Sel = "" | "yes" | "no";
const OPTIONS = [{ value: "" as Sel, label: "Не знаю" }, { value: "yes" as Sel, label: "Да" }, { value: "no" as Sel, label: "Нет" }];

// Доступность укрытия: подтверждённые сведения и форма «дополнить» (сведения идут на проверку модератору)
export default function AccessBlock({ s, citySlug }: { s: Shelter; citySlug: string }) {
  const a = s.access;
  const [open, setOpen] = useState(false);
  const [stepFree, setStepFree] = useState<Sel>("");
  const [pets, setPets] = useState<Sel>("");
  const [hours, setHours] = useState("");
  const [state, setState] = useState<{ t: "idle" | "sending" | "ok" | "err"; text?: string }>({ t: "idle" });

  const send = async () => {
    setState({ t: "sending" });
    try {
      const r = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: citySlug, shelterId: s.id, stepFree, pets, hours }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setState({ t: "err", text: `${j.error ?? "Не удалось отправить."}${j.code ? ` (код: ${j.code})` : ""}` });
      bumpHelp("access");
      setState({ t: "ok" });
      setOpen(false);
    } catch { setState({ t: "err", text: "Нет соединения. Попробуйте позже." }); }
  };

  return (
    <div className="card access">
      <h3><Accessibility size={16} />Доступность</h3>
      <ul className="acc-list">
        <li><Accessibility size={16} /><span>Вход без ступеней, пандус</span><b className={`tri ${triClass(a?.stepFree)}`}>{triLabel(a?.stepFree)}</b></li>
        <li><PawPrint size={16} /><span>С животными</span><b className={`tri ${triClass(a?.pets)}`}>{triLabel(a?.pets)}</b></li>
        <li><Clock4 size={16} /><span>Часы работы</span><b className={`tri ${a?.hours ? "yes" : "unk"}`}>{a?.hours ?? "Нет данных"}</b></li>
      </ul>
      {state.t === "ok" && <p className="ok" style={{ display: "flex", gap: 6, alignItems: "center" }}><CheckCircle2 size={15} />Спасибо! Сведения отправлены на проверку.</p>}
      {!open ? (
        <button className="photo-btn" style={{ margin: "8px 0 0" }} onClick={() => { setOpen(true); setState({ t: "idle" }); }}><Pencil size={16} />Дополнить сведения</button>
      ) : (
        <div className="form" style={{ marginTop: 10 }}>
          <div className="field"><span>Вход без ступеней, пандус</span><GlassSelect label="Вход без ступеней" value={stepFree} onChange={setStepFree} options={OPTIONS} /></div>
          <div className="field"><span>С животными</span><GlassSelect label="С животными" value={pets} onChange={setPets} options={OPTIONS} /></div>
          <label>Часы работы<input value={hours} maxLength={80} onChange={(e) => setHours(e.target.value)} placeholder="Например: круглосуточно" /></label>
          {state.t === "err" && <p className="err">{state.text}</p>}
          <div className="route-btns">
            <button className="btn" disabled={state.t === "sending" || (!stepFree && !pets && !hours.trim())} onClick={send}>{state.t === "sending" && <Spinner size={16} />}Отправить на проверку</button>
            <button className="btn btn-ghost-wide" onClick={() => setOpen(false)}>Отмена</button>
          </div>
          <p className="note" style={{ margin: 0 }}>Сообщайте только то, что вы видели сами. Модератор проверит сведения.</p>
        </div>
      )}
    </div>
  );
}
