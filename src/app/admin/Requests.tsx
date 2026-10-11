import { sql } from "@/lib/db";
import { REQUEST_LABEL, type RequestKind } from "@/lib/legal-meta";
import { closeDataRequest } from "./actions";

type Row = { id: string; kind: RequestKind; contact: string; details: string | null; state: string; created_at: Date };

export default async function Requests() {
  const rows = await sql()<Row[]>`SELECT id::text, kind, contact, details, state, created_at FROM data_requests ORDER BY (state = 'new') DESC, id DESC LIMIT 100`;
  if (!rows.length) return <p className="note">Запросов нет.</p>;
  return (
    <ul className="adm-list">
      {rows.map((r) => (
        <li key={r.id} className="adm-card">
          <div className="adm-title"><strong>{REQUEST_LABEL[r.kind] ?? r.kind}</strong><span className="chip">{r.state === "new" ? "новый" : "обработан"}</span></div>
          <p><b>Контакт:</b> {r.contact}</p>
          {r.details && <p>{r.details}</p>}
          <p className="note">{new Date(r.created_at).toLocaleString("ru-RU")} · ответить нужно в течение 10 рабочих дней</p>
          {r.state === "new" && <form action={closeDataRequest}><input type="hidden" name="id" value={r.id} /><button className="btn-plain">Отметить обработанным</button></form>}
        </li>
      ))}
    </ul>
  );
}
