"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Send } from "lucide-react";
import GlassSelect from "./GlassSelect";
import Spinner from "./Spinner";
import { REQUEST_KINDS, REQUEST_LABEL, type RequestKind } from "@/lib/legal-meta";

export default function DataRequestForm() {
  const [kind, setKind] = useState<RequestKind>("delete_profile");
  const [contact, setContact] = useState("");
  const [details, setDetails] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<{ t: "idle" | "sending" | "ok" | "err"; text?: string }>({ t: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ t: "sending" });
    try {
      const r = await fetch("/api/data-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, contact, details, consent, website }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setState({ t: "err", text: `${j.error ?? "Не удалось отправить."}${j.code ? ` (код: ${j.code})` : ""}` });
      setState({ t: "ok" });
    } catch { setState({ t: "err", text: "Нет соединения. Попробуйте позже." }); }
  };

  if (state.t === "ok") return <div className="card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "center" }}><span className="ico ico-green"><CheckCircle2 size={20} /></span><div><b>Запрос отправлен</b><p className="note" style={{ margin: 0 }}>Мы свяжемся с вами по указанным контактам.</p></div></div>;

  return (
    <form className="form card" style={{ padding: 16 }} onSubmit={submit}>
      <div className="field"><span>Что вы хотите сделать?</span>
        <GlassSelect label="Тип запроса" value={kind} onChange={setKind} options={REQUEST_KINDS.map((k) => ({ value: k, label: REQUEST_LABEL[k] }))} />
      </div>
      <label>Как с вами связаться * (почта, телефон или ник)
        <input required minLength={5} maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>
      <label>Подробности
        <textarea rows={4} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Например: адрес объекта и ваша роль, или имя в чате и сервис входа" />
      </label>
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Согласен на обработку указанных контактов для ответа на запрос на условиях <Link href="/privacy">Политики</Link>.</span>
      </label>
      {state.t === "err" && <p className="err">{state.text}</p>}
      <button className="primary" disabled={!consent || state.t === "sending"}>{state.t === "sending" ? <Spinner size={17} /> : <Send size={17} />}{state.t === "sending" ? "Отправляем…" : "Отправить запрос"}</button>
    </form>
  );
}
