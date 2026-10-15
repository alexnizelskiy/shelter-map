import { sql } from "@/lib/db";
import { radarStatus } from "@/lib/radar";
import { hideRadarPost, refreshRadarNow, setRadarEnabled } from "./actions";

export default async function RadarAdmin() {
  const st = await radarStatus();
  const recent = await sql()<{ id: string; posted_at: Date; text: string; region: string }[]>`SELECT id::text, posted_at, text, region FROM radar_posts WHERE NOT hidden ORDER BY posted_at DESC LIMIT 30`;
  return (
    <>
      <h2 className="adm-section">«Радар» — сообщения из канала @radarrussiia</h2>
      <div className="adm-card adm-form">
        <p className="note" style={{ margin: 0 }}>
          Статус: <b>{st.enabled ? "включён" : "выключен"}</b> · сообщений за сутки: {st.count} · последнее удачное обновление: {st.okAt ? new Date(st.okAt).toLocaleString("ru-RU") : "ещё не было"}.
          {st.error && <span className="err"> Ошибка последнего обновления: {st.error}</span>}
        </p>
        <p className="note" style={{ margin: 0 }}>Лента обновляется сама при открытии раздела, не чаще раза в минуту. Хранятся только последние сутки; подпись канала и реклама отбрасываются. Источник указан в разделе и ссылкой на канал.</p>
        <form action={setRadarEnabled} className="adm-inline">
          <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" name="enabled" value="1" defaultChecked={st.enabled} /> Раздел включён</label>
          <button className="btn-plain">Сохранить</button>
        </form>
        <form action={refreshRadarNow}><button className="btn-plain">Обновить сейчас</button></form>
      </div>
      <h2 className="adm-section">Последние сообщения</h2>
      <ul className="adm-list">
        {recent.length === 0 && <li className="note">Пока пусто.</li>}
        {recent.map((p) => (
          <li key={p.id} className="adm-card" style={{ gap: 6 }}>
            <div className="adm-title"><strong>{new Date(p.posted_at).toLocaleString("ru-RU")}</strong>{p.region && <span className="chip">{p.region}</span>}</div>
            <p style={{ whiteSpace: "pre-line" }}>{p.text}</p>
            <form action={hideRadarPost}><input type="hidden" name="id" value={p.id} /><button className="btn-plain btn-danger">Скрыть сообщение</button></form>
          </li>
        ))}
      </ul>
    </>
  );
}
