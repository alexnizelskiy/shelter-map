import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { CLEAR_OPTIONS, getSetting, DEFAULT_CLEAR_HOURS, maintainChat } from "@/lib/chat-db";
import { displayName, providerConfig, siteOrigin } from "@/lib/chat-auth";
import { banChatUser, clearChatNow, deleteChatMessage, dismissChatReports, saveChatSettings, unbanChatUser } from "./actions";

type Msg = { id: string; user_id: string; text: string; room: string; created_at: Date; first_name: string; last_initial: string; provider: string; reports: number };
type Banned = { id: string; first_name: string; last_initial: string; provider: string; banned_until: Date };

export default async function Chat() {
  const meta = await maintainChat();
  const hours = Number(await getSetting("clear_hours", String(DEFAULT_CLEAR_HOURS)));
  const providers = providerConfig();
  const h = await headers();
  const origin = siteOrigin(new Request("http://x", { headers: h }));

  const reported = await sql()<Msg[]>`
    SELECT m.id::text, m.user_id::text, m.text, m.room, m.created_at, u.first_name, u.last_initial, u.provider, count(r.id)::int AS reports
    FROM chat_reports r JOIN chat_messages m ON m.id = r.message_id AND NOT m.deleted JOIN chat_users u ON u.id = m.user_id
    GROUP BY m.id, u.id ORDER BY count(r.id) DESC, m.id DESC LIMIT 30`;
  const recent = await sql()<Msg[]>`
    SELECT m.id::text, m.user_id::text, m.text, m.room, m.created_at, u.first_name, u.last_initial, u.provider, 0 AS reports
    FROM chat_messages m JOIN chat_users u ON u.id = m.user_id WHERE NOT m.deleted ORDER BY m.id DESC LIMIT 40`;
  const banned = await sql()<Banned[]>`SELECT id::text, first_name, last_initial, provider, banned_until FROM chat_users WHERE banned_until > now() ORDER BY banned_until DESC LIMIT 50`;
  const [{ users, msgs }] = await sql()<{ users: number; msgs: number }[]>`SELECT (SELECT count(*) FROM chat_users)::int AS users, (SELECT count(*) FROM chat_messages WHERE NOT deleted)::int AS msgs`;

  const MsgCard = ({ m, withDismiss }: { m: Msg; withDismiss?: boolean }) => (
    <li className="adm-card">
      <div className="adm-title"><strong>{displayName(m.first_name, m.last_initial)}</strong><span className="chip">{m.provider}</span><span className="chip">/{m.room}</span>{m.reports > 0 && <span className="chip" style={{ background: "rgba(229,72,77,.18)" }}>жалоб: {m.reports}</span>}</div>
      <p>{m.text}</p>
      <p className="note">{new Date(m.created_at).toLocaleString("ru-RU")}</p>
      <div className="adm-inline">
        <form action={deleteChatMessage}><input type="hidden" name="id" value={m.id} /><button className="btn-plain btn-danger">Удалить</button></form>
        <form action={banChatUser} className="adm-inline"><input type="hidden" name="userId" value={m.user_id} />
          <button name="hours" value="24" className="btn-plain">Бан на сутки</button>
          <button name="hours" value="168" className="btn-plain">На неделю</button>
          <button name="hours" value="0" className="btn-plain btn-danger">Навсегда</button>
        </form>
        {withDismiss && <form action={dismissChatReports}><input type="hidden" name="id" value={m.id} /><button className="btn-plain">Жалоба необоснованна</button></form>}
      </div>
    </li>
  );

  return (
    <>
      <h2 className="adm-section">Настройки чата</h2>
      <form action={saveChatSettings} className="adm-card adm-form">
        <label>Как часто очищать чат (удаляются все сообщения)
          <select name="clear_hours" defaultValue={hours}>
            {CLEAR_OPTIONS.map((o) => <option key={o.hours} value={o.hours}>{o.label}</option>)}
          </select>
        </label>
        <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" name="enabled" value="1" defaultChecked={meta.enabled} /> Чат включён
        </label>
        <p className="note">
          {meta.nextClearAt ? `Следующая очистка: ${new Date(meta.nextClearAt).toLocaleString("ru-RU")}.` : "Автоочистка отключена."} Сейчас в чате {msgs} сообщений, пользователей: {users}.
        </p>
        <button className="primary">Сохранить</button>
      </form>
      <form action={clearChatNow}><button className="btn-plain btn-danger" style={{ marginTop: 10 }}>Очистить чат сейчас</button></form>

      <h2 className="adm-section">Способы входа</h2>
      <div className="adm-card">
        <ul className="adm-list" style={{ gap: 6 }}>
          <li>Яндекс ID: {providers.yandex ? "настроен" : "нет YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET"}<p className="note">Redirect URI: {origin}/api/auth/yandex/callback</p></li>
          <li>VK ID: {providers.vk ? "настроен" : "нет VK_CLIENT_ID"}<p className="note">Доверенный redirect URL: {origin}/api/auth/vk/callback</p></li>
          <li>Telegram: {providers.telegram ? "настроен" : "нет TELEGRAM_BOT_TOKEN и NEXT_PUBLIC_TELEGRAM_BOT"}<p className="note">В BotFather: /setdomain → {new URL(origin).host}</p></li>
          <li>MAX (внутри мини-приложения): {providers.max ? "настроен" : "нет MAX_BOT_TOKEN"}</li>
          {providers.dev && <li>Тестовый вход включён (CHAT_DEV_LOGIN=1): отключите в боевой среде.</li>}
        </ul>
      </div>

      <h2 className="adm-section">Жалобы ({reported.length})</h2>
      {reported.length ? <ul className="adm-list">{reported.map((m) => <MsgCard key={m.id} m={m} withDismiss />)}</ul> : <p className="note">Жалоб нет.</p>}

      <h2 className="adm-section">Заблокированные ({banned.length})</h2>
      {banned.length ? (
        <ul className="adm-list">
          {banned.map((b) => (
            <li key={b.id} className="adm-card">
              <div className="adm-title"><strong>{displayName(b.first_name, b.last_initial)}</strong><span className="chip">{b.provider}</span><span className="chip">до {new Date(b.banned_until).getFullYear() > 2100 ? "навсегда" : new Date(b.banned_until).toLocaleString("ru-RU")}</span></div>
              <form action={unbanChatUser}><input type="hidden" name="userId" value={b.id} /><button className="btn-plain">Разблокировать</button></form>
            </li>
          ))}
        </ul>
      ) : <p className="note">Никого.</p>}

      <h2 className="adm-section">Последние сообщения</h2>
      {recent.length ? <ul className="adm-list">{recent.map((m) => <MsgCard key={m.id} m={m} />)}</ul> : <p className="note">Пока пусто.</p>}
    </>
  );
}
