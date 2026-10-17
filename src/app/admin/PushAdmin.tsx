import { sql } from "@/lib/db";
import { describe, type Schedule } from "@/lib/push-campaign";
import { createPushCampaign, deleteCampaign, sendCampaignNowAction, setCampaignStatus } from "./actions";
import AdminPushTest from "./AdminPushTest";

type Row = {
  id: string; title: string; body: string; url: string; audience_region: string | null; repeat_kind: Schedule["repeat"]; every_minutes: number | null;
  time_of_day: string | null; weekdays: number[] | null; next_run_at: Date | null; end_at: Date | null; max_runs: number | null; runs: number;
  last_run_at: Date | null; last_sent: number | null; last_failed: number | null; status: "active" | "paused" | "done";
};

const msk = (d: Date | null) => (d ? new Date(d).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const STATUS = { active: "идёт", paused: "на паузе", done: "завершена" } as const;
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default async function PushAdmin({ result }: { result?: string }) {
  const subs = await sql()<{ scope: string; region: string; test: boolean; n: number }[]>`SELECT scope, region, test, count(*)::int AS n FROM push_subscriptions WHERE fails < 5 GROUP BY scope, region, test`;
  const total = subs.filter((s) => !s.test).reduce((a, s) => a + s.n, 0);
  const tests = subs.filter((s) => s.test).reduce((a, s) => a + s.n, 0);
  const regions = [...new Set(subs.filter((s) => !s.test && s.scope === "region" && s.region).map((s) => s.region))];
  const rows = await sql()<Row[]>`SELECT id::text, title, body, url, audience_region, repeat_kind, every_minutes, time_of_day, weekdays, next_run_at, end_at, max_runs, runs, last_run_at, last_sent, last_failed, status
    FROM push_campaigns ORDER BY (status = 'active') DESC, next_run_at NULLS LAST, id DESC LIMIT 60`;

  return (
    <>
      {result && <p className={result.startsWith("ok") ? "ok" : "err"} role="status" style={{ fontSize: 14 }}>{result.startsWith("ok") ? (result.slice(3) || "Готово: рассылка создана.") : `Ошибка: ${result.slice(4)}`}</p>}

      <h2 className="adm-section">Подписчики</h2>
      <div className="kpis">
        <div className="card kpi"><b>{total}</b><span>устройств с уведомлениями</span></div>
        <div className="card kpi"><b>{subs.filter((s) => !s.test && s.scope === "all").reduce((a, s) => a + s.n, 0)}</b><span>выбрали «вся Россия»</span></div>
        <div className="card kpi"><b>{subs.filter((s) => !s.test && s.scope === "region").reduce((a, s) => a + s.n, 0)}</b><span>выбрали свой регион</span></div>
        <div className="card kpi"><b>{tests}</b><span>тестовых устройств</span></div>
      </div>
      <p className="note">Рассылки получают только те, кто сам включил уведомления. Сообщения радара присылаются отдельно, автоматически. Расписание проверяется при каждом обращении cron (раз в минуту).</p>
      <div className="adm-card" style={{ gap: 6 }}>
        <p className="note" style={{ margin: 0 }}>Чтобы проверять рассылки на себе, включите уведомления на своём устройстве как тестовые: тест уйдёт только на такие устройства.</p>
        <AdminPushTest />
      </div>

      <h2 className="adm-section">Новое уведомление</h2>
      <form action={createPushCampaign} className="adm-card adm-form">
        <label>Заголовок (до 60 знаков)<input name="title" required maxLength={60} placeholder="Опора: обновили список укрытий" /></label>
        <label>Текст (до 240 знаков)<textarea name="body" required minLength={3} maxLength={240} rows={3} placeholder="Добавили новые города. Откройте карту и проверьте укрытие рядом с домом." style={{ padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--field)", color: "var(--fg)", font: "inherit" }} /></label>
        <label>Куда ведёт нажатие (адрес внутри сайта)<input name="url" defaultValue="/" placeholder="/rostov-na-donu?radar=1" /></label>
        <label>Кому
          <select name="audience" defaultValue="__all">
            <option value="__all">Всем подписчикам ({total})</option>
            {regions.map((r) => <option key={r} value={r}>Только выбравшим регион «{r}»</option>)}
          </select>
        </label>

        <fieldset className="adm-fieldset">
          <legend>Когда отправлять (время по Москве)</legend>
          <label className="adm-radio"><input type="radio" name="mode" value="now" defaultChecked /> Сразу, один раз</label>
          <label className="adm-radio"><input type="radio" name="mode" value="at" /> Один раз в указанное время</label>
          <label className="adm-radio"><input type="radio" name="mode" value="interval" /> Повторять каждые
            <input name="every" type="number" min={1} defaultValue={6} style={{ width: 70 }} />
            <select name="unit" defaultValue="h"><option value="m">минут (от 15)</option><option value="h">часов</option><option value="d">дней</option></select>
          </label>
          <label className="adm-radio"><input type="radio" name="mode" value="daily" /> Каждый день</label>
          <label className="adm-radio"><input type="radio" name="mode" value="weekly" /> По дням недели</label>
          <div className="adm-inline">
            {WD.map((d, i) => <label key={d} className="check" style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 14 }}><input type="checkbox" name={`wd_${i + 1}`} value="1" /> {d}</label>)}
          </div>
          <div className="adm-grid">
            <label>Время для «каждый день / по дням» (часы:минуты)<input name="time" type="time" defaultValue="09:00" /></label>
            <label>Дата и время (для «в указанное время»; для повторов — начало)<input name="send_at" type="datetime-local" /></label>
            <label>Закончить не позже (необязательно)<input name="end_at" type="datetime-local" /></label>
            <label>Не больше раз (необязательно)<input name="max_runs" type="number" min={1} max={1000} /></label>
          </div>
        </fieldset>
        <p className="note" style={{ margin: 0 }}>Присылайте только полезное и редкое: частые сообщения быстро заставляют людей отключать уведомления. Рекламные рассылки требуют отдельного согласия и маркировки.</p>
        <button className="primary">Создать рассылку</button>
      </form>

      <h2 className="adm-section">Рассылки</h2>
      <ul className="adm-list">
        {rows.length === 0 && <li className="note">Пока нет ни одной.</li>}
        {rows.map((r) => (
          <li key={r.id} className="adm-card" style={{ gap: 6 }}>
            <div className="adm-title"><strong>{r.title}</strong><span className="chip" style={r.status === "active" ? { background: "rgba(52,213,138,.2)" } : undefined}>{STATUS[r.status]}</span><span className="chip">{r.audience_region ?? "все подписчики"}</span></div>
            <p>{r.body}</p>
            <p className="note" style={{ margin: 0 }}>
              Расписание: {describe({ repeat: r.repeat_kind, every_minutes: r.every_minutes, time_of_day: r.time_of_day, weekdays: r.weekdays })}
              {r.status === "active" && r.next_run_at ? ` · следующая: ${msk(r.next_run_at)}` : ""}
              {r.end_at ? ` · до ${msk(r.end_at)}` : ""}{r.max_runs ? ` · не больше ${r.max_runs} раз` : ""}
              {` · отправок: ${r.runs}`}{r.last_run_at ? ` · последняя ${msk(r.last_run_at)} (доставлено ${r.last_sent ?? 0}, нет ${r.last_failed ?? 0})` : ""}
              {` · ссылка ${r.url}`}
            </p>
            <div className="adm-inline">
              {r.status === "active" && <form action={setCampaignStatus}><input type="hidden" name="id" value={r.id} /><button name="action" value="pause" className="btn-plain">Пауза</button></form>}
              {r.status !== "active" && <form action={setCampaignStatus}><input type="hidden" name="id" value={r.id} /><button name="action" value="resume" className="btn-plain">{r.status === "done" ? "Запустить снова" : "Продолжить"}</button></form>}
              <form action={sendCampaignNowAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="test" value="1" /><button className="btn-plain">Отправить тест</button></form>
              <form action={sendCampaignNowAction}><input type="hidden" name="id" value={r.id} /><button className="btn-plain">Отправить всем сейчас</button></form>
              <form action={deleteCampaign}><input type="hidden" name="id" value={r.id} /><button className="btn-plain btn-danger">Удалить</button></form>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
