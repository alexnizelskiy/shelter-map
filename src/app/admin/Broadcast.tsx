import { sql } from "@/lib/db";
import { botUsername } from "@/lib/telegram";
import { MAX_TEXT, progress } from "@/lib/broadcast";
import { createBroadcast, sendBroadcastTest } from "./actions";
import BroadcastRunner from "./BroadcastRunner";

type Aud = { platform: string; source: string; n: number };
const PLATFORM = { telegram: "Telegram", max: "MAX" } as const;

export default async function Broadcast({ result, run, test }: { result?: string; run?: string; test?: string }) {
  const aud = await sql()<Aud[]>`
    SELECT platform, source, count(*)::int AS n FROM bot_users
    WHERE started AND notify AND NOT blocked AND chat_id IS NOT NULL GROUP BY platform, source ORDER BY n DESC`;
  const byPlatform = { telegram: 0, max: 0 };
  for (const a of aud) byPlatform[a.platform as "telegram" | "max"] += a.n;
  const sources = [...new Set(aud.map((a) => a.source).filter(Boolean))];

  const [{ off, blocked, appOnly }] = await sql()<{ off: number; blocked: number; appOnly: number }[]>`
    SELECT count(*) FILTER (WHERE started AND NOT notify)::int AS off, count(*) FILTER (WHERE blocked)::int AS blocked, count(*) FILTER (WHERE NOT started)::int AS "appOnly" FROM bot_users`;

  const hist = await sql()<{ id: number }[]>`SELECT id::int AS id FROM broadcasts ORDER BY id DESC LIMIT 10`;
  const items = (await Promise.all(hist.map((h) => progress(h.id)))).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const runId = Number(run);
  const texts = await sql()<{ id: number; text: string; platforms: string[]; source: string | null; created_at: string }[]>`SELECT id::int AS id, text, platforms, source, created_at FROM broadcasts ORDER BY id DESC LIMIT 10`;
  const meta = new Map(texts.map((t) => [t.id, t]));

  return (
    <>
      {result && <p className={result.startsWith("ok") ? "ok" : "err"} role="status" style={{ fontSize: 14 }}>{result.startsWith("ok") ? (test ? "Тестовое сообщение отправлено." : "Готово.") : `Ошибка: ${result.slice(4)}`}</p>}

      <h2 className="adm-section">Кому можно писать</h2>
      <div className="kpis">
        <div className="card kpi"><b>{byPlatform.telegram}</b><span>Telegram</span></div>
        <div className="card kpi"><b>{byPlatform.max}</b><span>MAX</span></div>
        <div className="card kpi"><b>{off}</b><span>отключили (/stop)</span></div>
        <div className="card kpi"><b>{blocked}</b><span>заблокировали бота</span></div>
      </div>
      <p className="note">Писать можно только тем, кто сам запускал бота (/start) и не отключил сообщения. Ещё {appOnly} чел. открывали только мини-приложение, не запуская бота: им отправить нельзя.</p>

      {items.some((i) => i.status === "sending") && !runId && <p className="warn">Есть неоконченные рассылки: нажмите «Продолжить отправку» у нужной.</p>}
      {items.map((p) => {
        const m = meta.get(p.id);
        return (
          <div key={p.id}>
            <BroadcastRunner id={p.id} initial={p} autostart={runId === p.id} />
            {m && <p className="note" style={{ margin: "4px 6px 12px" }}>{new Date(m.created_at).toLocaleString("ru-RU")} · {m.platforms.map((x) => PLATFORM[x as "telegram" | "max"] ?? x).join(", ")}{m.source ? ` · метка «${m.source}»` : ""} · «{m.text.slice(0, 120)}{m.text.length > 120 ? "…" : ""}»</p>}
          </div>
        );
      })}

      <h2 className="adm-section">Новая рассылка</h2>
      <form action={createBroadcast} className="adm-card adm-form">
        <label>Текст сообщения (до {MAX_TEXT} символов; в конце автоматически добавится «Отключить такие сообщения: /stop»)
          <textarea name="text" rows={5} required minLength={3} maxLength={MAX_TEXT} placeholder="Например: Обновили список укрытий в Ростове-на-Дону. Откройте карту и проверьте ближайшее к вам." style={{ padding: "11px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--field)", color: "var(--fg)", font: "inherit" }} />
        </label>
        <div className="adm-grid">
          <label>Кнопка: надпись (необязательно)<input name="button_text" maxLength={40} placeholder="Открыть карту" /></label>
          <label>Кнопка: ссылка https://…<input name="button_url" placeholder="https://www.oporamap.ru/" /></label>
        </div>
        <div className="adm-inline" style={{ gap: 18 }}>
          <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" name="p_telegram" value="1" defaultChecked /> Telegram ({byPlatform.telegram})</label>
          <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" name="p_max" value="1" defaultChecked /> MAX ({byPlatform.max})</label>
        </div>
        <label>Кому
          <select name="source" defaultValue="__all">
            <option value="__all">Всем, кто запускал бота</option>
            {sources.map((s) => <option key={s} value={s}>Только пришедшим по метке «{s}»</option>)}
          </select>
        </label>
        <p className="note" style={{ margin: 0 }}>Сначала отправьте тест себе (форма ниже), потом запускайте. Отправка идёт партиями, пока эта страница открыта; остановить можно в любой момент. Присылайте только полезное: предупреждения, обновления данных, важные новости. Рекламные сообщения требуют отдельного согласия человека и маркировки.</p>
        <button className="primary">Запустить рассылку</button>
      </form>

      <h2 className="adm-section">Тест на одного человека</h2>
      <form action={sendBroadcastTest} className="adm-card adm-form">
        <div className="adm-grid">
          <label>Платформа
            <select name="platform" defaultValue="telegram"><option value="telegram">Telegram{botUsername() ? ` (@${botUsername()})` : ""}</option><option value="max">MAX</option></select>
          </label>
          <label>ID получателя (команда /id в боте)<input name="to" inputMode="numeric" placeholder="123456789" required /></label>
          <label className="wide">Текст<input name="text" required minLength={3} placeholder="Тестовое сообщение" /></label>
          <label>Кнопка: надпись<input name="button_text" maxLength={40} /></label>
          <label>Кнопка: ссылка https://…<input name="button_url" /></label>
        </div>
        <button className="btn-plain">Отправить тест</button>
      </form>
    </>
  );
}
