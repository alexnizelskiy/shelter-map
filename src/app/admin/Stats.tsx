import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { cleanSource } from "@/lib/bot-users";
import { siteOrigin } from "@/lib/chat-auth";
import { botUsername } from "@/lib/telegram";
import { maxUsername } from "@/lib/max";

import { STATS_SQL as S } from "@/lib/stats-sql";

const n = (v: number | string | null | undefined) => Number(v ?? 0).toLocaleString("ru-RU");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const CHANNEL: Record<string, string> = { web: "Сайт в браузере", pwa: "Установленное приложение", tg: "Telegram", max: "MAX" };
const PLATFORM: Record<string, string> = { telegram: "Telegram", max: "MAX" };

type One = Record<string, number>;

export default async function Stats({ label }: { label?: string }) {
  const q = <T,>(text: string) => sql().unsafe(text) as unknown as Promise<T>;

  const [today] = await q<One[]>(S.today);

  const series = await q<{ day: string; web: number; bot: number; new_bot: number; new_chat: number }[]>(S.series);
  const maxWeb = Math.max(1, ...series.map((s) => s.web + s.bot));

  const [web, starts, firsts, chats] = await Promise.all([
    q<{ source: string; n: number }[]>(S.webBySource),
    q<{ source: string; n: number; people: number }[]>(S.startsBySource),
    q<{ source: string; n: number }[]>(S.firstBySource),
    q<{ source: string; n: number }[]>(S.chatBySource),
  ]);
  const keys = [...new Set([...web, ...starts, ...firsts, ...chats].map((r) => r.source))];
  const rows = keys.map((k) => ({
    key: k,
    web: web.find((r) => r.source === k)?.n ?? 0,
    starts: starts.find((r) => r.source === k)?.n ?? 0,
    people: starts.find((r) => r.source === k)?.people ?? 0,
    first: firsts.find((r) => r.source === k)?.n ?? 0,
    chat: chats.find((r) => r.source === k)?.n ?? 0,
  })).sort((a, b) => b.web + b.starts + b.chat - (a.web + a.starts + a.chat));

  const platforms = await q<{ platform: string; total: number; started: number; reachable: number; blocked: number; subscribed: number; not_subscribed: number; only_app: number }[]>(S.platforms);
  const channels = await q<{ channel: string; n: number }[]>(S.channels);
  const cities = await q<{ city: string; n: number }[]>(S.cities);
  const chatProviders = await q<{ provider: string; n: number }[]>(S.chatProviders);
  const [ret] = await q<One[]>(S.retention);

  const origin = siteOrigin(new Request("http://x", { headers: await headers() }));
  const lbl = cleanSource(label);
  const tgBot = botUsername();
  const maxBot = maxUsername();

  return (
    <>
      <h2 className="adm-section">Сегодня (по Москве)</h2>
      <div className="kpis">
        <div className="card kpi"><b>{n(today.web)}</b><span>посетителей сайта</span></div>
        <div className="card kpi"><b>{n(today.tg_active)}</b><span>активны в Telegram</span></div>
        <div className="card kpi"><b>{n(today.max_active)}</b><span>активны в MAX</span></div>
        <div className="card kpi"><b>{n(today.tg_new + today.max_new)}</b><span>новых в ботах</span></div>
        <div className="card kpi"><b>{n(today.chat_new)}</b><span>новых профилей чата</span></div>
        <div className="card kpi"><b>{n(today.suggestions + today.photos)}</b><span>заявок и фото</span></div>
        <div className="card kpi"><b>{n(today.reports)}</b><span>отметок о входе</span></div>
      </div>
      {channels.length > 0 && <p className="note">Откуда заходили на сайт сегодня: {channels.map((c) => `${CHANNEL[c.channel] ?? c.channel} — ${c.n}`).join(" · ")}.</p>}

      <h2 className="adm-section">По дням (14 дней)</h2>
      <div className="adm-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="stats-table">
          <thead><tr><th>День</th><th>Посетителей сайта</th><th>Активных в ботах</th><th>Новых в ботах</th><th>Новых в чате</th></tr></thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.day}>
                <td>{s.day}</td>
                <td><div className="bar sm"><i style={{ width: `${(s.web / maxWeb) * 100}%` }} /></div>{n(s.web)}</td>
                <td><div className="bar sm alt"><i style={{ width: `${(s.bot / maxWeb) * 100}%` }} /></div>{n(s.bot)}</td>
                <td>{n(s.new_bot)}</td>
                <td>{n(s.new_chat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="adm-section">Откуда приходят (30 дней)</h2>
      <p className="note">Метка берётся из ссылки: <code>t.me/бот?start=метка</code>, <code>max.ru/бот?start=метка</code>, <code>сайт/?src=метка</code>. Без метки на сайте показывается домен, откуда перешли (например, ref:yandex.ru), а прямые заходы идут в строку «без метки».</p>
      <div className="adm-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="stats-table">
          <thead><tr><th>Метка</th><th>Посетителей сайта</th><th>Запусков бота (людей)</th><th>Новых в ботах</th><th>Регистраций в чате</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="note">Данных пока нет: счётчик начал работать с момента выхода этой версии.</td></tr>}
            {rows.map((r) => (
              <tr key={r.key || "_"}>
                <td>{r.key || <i>без метки</i>}</td>
                <td>{n(r.web)}</td>
                <td>{n(r.starts)} ({n(r.people)})</td>
                <td>{n(r.first)}</td>
                <td>{n(r.chat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="adm-section">Боты</h2>
      <div className="adm-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="stats-table">
          <thead><tr><th>Платформа</th><th>Всего</th><th>Запускали бота</th><th>Можно писать</th><th>Заблокировали</th><th>Подписаны на канал</th><th>Не подписаны</th><th>Только приложение</th></tr></thead>
          <tbody>
            {platforms.length === 0 && <tr><td colSpan={8} className="note">Пока никто не открывал ботов.</td></tr>}
            {platforms.map((p) => (
              <tr key={p.platform}><td>{PLATFORM[p.platform] ?? p.platform}</td><td>{n(p.total)}</td><td>{n(p.started)} ({pct(p.started, p.total)})</td><td>{n(p.reachable)}</td><td>{n(p.blocked)}</td><td>{n(p.subscribed)}</td><td>{n(p.not_subscribed)}</td><td>{n(p.only_app)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Вернулись хотя бы в один из следующих дней: {pct(ret.returned, ret.total)} ({n(ret.returned)} из {n(ret.total)}, считаются те, кто пришёл больше двух суток назад).</p>

      <div className="stats-cols">
        <div>
          <h2 className="adm-section">Города (7 дней, посетителей)</h2>
          <div className="adm-card" style={{ gap: 4 }}>
            {cities.length === 0 && <p className="note" style={{ margin: 0 }}>Данных пока нет.</p>}
            {cities.map((c) => <div key={c.city} className="adm-title" style={{ justifyContent: "space-between" }}><span>/{c.city}</span><b>{n(c.n)}</b></div>)}
          </div>
        </div>
        <div>
          <h2 className="adm-section">Профили чата по входу</h2>
          <div className="adm-card" style={{ gap: 4 }}>
            {chatProviders.length === 0 && <p className="note" style={{ margin: 0 }}>Профилей пока нет.</p>}
            {chatProviders.map((c) => <div key={c.provider} className="adm-title" style={{ justifyContent: "space-between" }}><span>{c.provider}</span><b>{n(c.n)}</b></div>)}
          </div>
        </div>
      </div>

      <h2 className="adm-section">Ссылки с меткой</h2>
      <form method="get" action="/admin" className="adm-card adm-form">
        <input type="hidden" name="tab" value="stats" />
        <label>Метка (латиница, цифры, _ и -, до 64 знаков): например, vk_post_12 или channel_oct
          <input name="label" defaultValue={label ?? ""} placeholder="vk_post_12" pattern="[A-Za-z0-9_-]{1,64}" />
        </label>
        <button className="btn-plain">Собрать ссылки</button>
        {label && !lbl && <p className="err" style={{ margin: 0 }}>Метка может содержать только латиницу, цифры, _ и -.</p>}
        {lbl && (
          <div style={{ display: "grid", gap: 6, fontSize: 14, wordBreak: "break-all" }}>
            {tgBot ? <div>Telegram: <code>https://t.me/{tgBot}?start={lbl}</code></div> : <div className="note">Telegram: не задан NEXT_PUBLIC_TELEGRAM_BOT</div>}
            {maxBot ? <div>MAX: <code>https://max.ru/{maxBot}?start={lbl}</code></div> : <div className="note">MAX: не задан NEXT_PUBLIC_MAX_BOT</div>}
            <div>Сайт: <code>{origin}/?src={lbl}</code></div>
            <div>Страница города: <code>{origin}/rostov-na-donu?src={lbl}</code></div>
          </div>
        )}
      </form>
    </>
  );
}
