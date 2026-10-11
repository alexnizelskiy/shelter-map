import { sql } from "@/lib/db";
import type { Shelter } from "@/lib/shelters";
import { approveAccessSuggestion, rejectAccessSuggestion, setAccessManual } from "./actions";

type Sug = { id: string; shelter_id: string; field: string; value: string; created_at: Date };
type Cur = { shelter_id: string; step_free: string | null; pets: string | null; hours: string | null };
const FIELD: Record<string, string> = { step_free: "Вход без ступеней", pets: "С животными", hours: "Часы работы" };
const VAL = (f: string, v: string) => (f === "hours" ? v : v === "yes" ? "да" : "нет");

export default async function Access({ all, q }: { all: Shelter[]; q: string }) {
  const byId = new Map(all.map((s) => [s.id, s]));
  const pending = await sql()<Sug[]>`SELECT id::text, shelter_id, field, value, created_at FROM access_suggestions WHERE state = 'new' ORDER BY id LIMIT 100`;
  const current = await sql()<Cur[]>`SELECT shelter_id, step_free, pets, hours FROM shelter_access`;
  const curMap = new Map(current.map((c) => [c.shelter_id, c]));
  const needle = q.trim().toLowerCase();
  const found = needle.length >= 2 ? all.filter((s) => `${s.address} ${s.holder ?? ""}`.toLowerCase().includes(needle)).slice(0, 12) : [];

  return (
    <>
      <h2 className="adm-section">Предложения жителей ({pending.length})</h2>
      {pending.length === 0 ? <p className="note">Новых предложений нет.</p> : (
        <ul className="adm-list">
          {pending.map((p) => (
            <li key={p.id} className="adm-card">
              <div className="adm-title"><strong>{byId.get(p.shelter_id)?.address ?? p.shelter_id}</strong><span className="chip">{FIELD[p.field]}: {VAL(p.field, p.value)}</span></div>
              <p className="note">{new Date(p.created_at).toLocaleString("ru-RU")} · сведение от жителя, не проверено</p>
              <div className="adm-inline">
                <form action={approveAccessSuggestion}><input type="hidden" name="id" value={p.id} /><button className="primary" style={{ width: "auto", padding: "10px 18px" }}>Принять</button></form>
                <form action={rejectAccessSuggestion}><input type="hidden" name="id" value={p.id} /><button className="btn-plain btn-danger">Отклонить</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="adm-section">Заполнить вручную</h2>
      <form className="adm-inline" method="get" action="/admin">
        <input type="hidden" name="tab" value="access" />
        <input name="q" defaultValue={q} placeholder="Адрес или организация (от 2 символов)" />
        <button className="btn-plain">Найти</button>
      </form>
      {needle.length >= 2 && found.length === 0 && <p className="note">Ничего не найдено.</p>}
      <ul className="adm-list" style={{ marginTop: 10 }}>
        {found.map((s) => {
          const c = curMap.get(s.id);
          return (
            <li key={s.id} className="adm-card">
              <div className="adm-title"><strong>{s.address}</strong>{s.holder && <span className="chip">{s.holder}</span>}</div>
              <form action={setAccessManual} className="adm-form">
                <input type="hidden" name="shelterId" value={s.id} />
                <div className="adm-grid">
                  <label>Вход без ступеней
                    <select name="stepFree" defaultValue={c?.step_free ?? ""}><option value="">нет данных</option><option value="yes">да</option><option value="no">нет</option></select>
                  </label>
                  <label>С животными
                    <select name="pets" defaultValue={c?.pets ?? ""}><option value="">нет данных</option><option value="yes">да</option><option value="no">нет</option></select>
                  </label>
                  <label className="wide">Часы работы
                    <input name="hours" defaultValue={c?.hours ?? ""} placeholder="круглосуточно, 9:00–18:00 …" maxLength={80} />
                  </label>
                </div>
                <button className="primary">Сохранить</button>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
