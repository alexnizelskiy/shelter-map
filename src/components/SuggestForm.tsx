"use client";

import { useState } from "react";
import { BASIS_LABEL, SUGGEST_BASIS, SUGGEST_KIND_LABEL, SUGGEST_KINDS, type SuggestBasis, type SuggestKind } from "@/lib/reports";

export type Draft = {
  kind: SuggestKind;
  basis: SuggestBasis;
  address: string;
  sourceUrl: string;
  comment: string;
  consent: boolean;
  website: string; // ловушка для ботов, человек не видит
  lat: number | null;
  lng: number | null;
};

export const EMPTY_DRAFT: Draft = {
  kind: "unknown", basis: "own_observation", address: "", sourceUrl: "", comment: "",
  consent: false, website: "", lat: null, lng: null,
};

type Props = {
  citySlug: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onPickOnMap: () => void;
};

export default function SuggestForm({ citySlug, draft, setDraft, onPickOnMap }: Props) {
  const [state, setState] = useState<{ type: "idle" | "sending" | "ok" | "error"; text?: string }>({ type: "idle" });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  const useMyLocation = () =>
    navigator.geolocation.getCurrentPosition(
      (p) => setDraft({ ...draft, lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setState({ type: "error", text: "Не удалось определить местоположение. Отметьте точку на карте." }),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ type: "sending" });
    try {
      const r = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, city: citySlug }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setState({ type: "error", text: j.error ?? "Не удалось отправить." });
      setDraft(EMPTY_DRAFT);
      setState({ type: "ok" });
    } catch {
      setState({ type: "error", text: "Нет соединения. Попробуйте позже." });
    }
  };

  if (state.type === "ok")
    return (
      <div className="about">
        <h2>Заявка отправлена</h2>
        <p>Спасибо! Заявка попадёт в очередь проверки и не появится на карте сразу. Мы сверим её с официальными источниками.</p>
        <button className="btn-plain" onClick={() => setState({ type: "idle" })}>Предложить ещё одно место</button>
      </div>
    );

  return (
    <form className="form" onSubmit={submit}>
      <h2>Предложить место</h2>
      <p className="note">Не ходите к объектам специально и не фотографируйте охраняемые помещения. Сообщайте только то, что заметили в обычных обстоятельствах.</p>

      <label>Что это за объект?
        <select value={draft.kind} onChange={(e) => set("kind", e.target.value as SuggestKind)}>
          {SUGGEST_KINDS.map((k) => <option key={k} value={k}>{SUGGEST_KIND_LABEL[k]}</option>)}
        </select>
      </label>

      <label>Адрес или описание места *
        <input required minLength={5} maxLength={200} value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="Например: ул. Пушкинская, 10, подвал" />
      </label>

      <div className="field">
        <span>Точка на карте *</span>
        <div className="row-btns">
          <button type="button" className="btn-plain" onClick={onPickOnMap}>Указать на карте</button>
          <button type="button" className="btn-plain" onClick={useMyLocation}>Моё местоположение</button>
        </div>
        <small className="note">{draft.lat != null && draft.lng != null ? `Выбрано: ${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}` : "Точка не выбрана"}</small>
      </div>

      <label>На чём основана информация?
        <select value={draft.basis} onChange={(e) => set("basis", e.target.value as SuggestBasis)}>
          {SUGGEST_BASIS.map((k) => <option key={k} value={k}>{BASIS_LABEL[k]}</option>)}
        </select>
      </label>

      {draft.basis === "official_link" && (
        <label>Ссылка на источник
          <input type="url" maxLength={300} value={draft.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://" />
        </label>
      )}

      <label>Дополнительные сведения
        <textarea maxLength={300} rows={3} value={draft.comment} onChange={(e) => set("comment", e.target.value)} placeholder="Необязательно. Не указывайте личные данные." />
      </label>

      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={draft.website} onChange={(e) => set("website", e.target.value)} />

      <label className="check">
        <input type="checkbox" checked={draft.consent} onChange={(e) => set("consent", e.target.checked)} />
        <span>Подтверждаю, что не указываю личные данные других людей. Понимаю, что заявка проходит проверку и может быть отклонена.</span>
      </label>

      {state.type === "error" && <p className="err">{state.text}</p>}
      <button className="primary" disabled={state.type === "sending" || !draft.consent || draft.lat == null}>
        {state.type === "sending" ? "Отправляем…" : "Отправить на проверку"}
      </button>
    </form>
  );
}
