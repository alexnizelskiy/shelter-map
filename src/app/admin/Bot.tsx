import { headers } from "next/headers";
import { botToken, botUsername, channelId, channelLink, gateEnabled, tg, urgentEnabled, webhookSecret } from "@/lib/telegram";
import { siteOrigin } from "@/lib/chat-auth";
import { removeTelegramWebhook, setupTelegramBot } from "./actions";

type Info = { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number };
type Row = { label: string; ok: boolean | null; text: string };

const ok = (label: string, text: string): Row => ({ label, ok: true, text });
const bad = (label: string, text: string): Row => ({ label, ok: false, text });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

export default async function Bot({ result }: { result?: string }) {
  const origin = siteOrigin(new Request("http://x", { headers: await headers() }));
  const expected = `${origin}/api/bot/telegram`;
  const rows: Row[] = [];

  rows.push(botToken() ? ok("Токен бота", "задан (TELEGRAM_BOT_TOKEN)") : bad("Токен бота", "не задан: добавьте TELEGRAM_BOT_TOKEN в Vercel"));
  rows.push(botUsername() ? ok("Имя бота", `@${botUsername()}`) : bad("Имя бота", "не задано: NEXT_PUBLIC_TELEGRAM_BOT (без @)"));
  rows.push(webhookSecret() ? ok("Секрет вебхука", "задан (TELEGRAM_WEBHOOK_SECRET)") : bad("Секрет вебхука", "не задан: придумайте строку из букв, цифр, _ и - и добавьте TELEGRAM_WEBHOOK_SECRET"));
  rows.push(gateEnabled() ? ok("Канал для подписки", `${channelId()}${channelLink() ? ` · ${channelLink()}` : " · ссылка не задана (TELEGRAM_CHANNEL_LINK)"}`) : { label: "Канал для подписки", ok: null, text: "не задан: проверка подписки выключена, карта открывается всем (TELEGRAM_CHANNEL)" });
  rows.push({ label: "Кнопка «Срочно» без подписки", ok: null, text: urgentEnabled() ? "включена" : "выключена (TELEGRAM_URGENT_BUTTON=0)" });

  let hook: Info | null = null;
  if (botToken()) {
    let botId = 0;
    try { const me = await tg<{ id: number; username: string }>("getMe"); botId = me.id; rows.push(ok("Связь с Telegram", `бот @${me.username} отвечает`)); }
    catch (e) { rows.push(bad("Связь с Telegram", `getMe: ${msg(e)}`)); }
    try { hook = await tg<Info>("getWebhookInfo"); } catch (e) { rows.push(bad("Вебхук", msg(e))); }
    if (hook) {
      if (!hook.url) rows.push(bad("Вебхук", "не установлен: нажмите «Установить бота»"));
      else if (hook.url !== expected) rows.push(bad("Вебхук", `смотрит на другой адрес: ${hook.url}`));
      else rows.push(ok("Вебхук", `установлен, в очереди ${hook.pending_update_count ?? 0}`));
      if (hook.last_error_message) rows.push(bad("Последняя ошибка доставки", `${hook.last_error_message}${hook.last_error_date ? ` (${new Date(hook.last_error_date * 1000).toLocaleString("ru-RU")})` : ""}`));
    }
    if (gateEnabled() && botId) {
      try { await tg("getChat", { chat_id: channelId() }); rows.push(ok("Канал найден", channelId())); }
      catch (e) { rows.push(bad("Канал найден", `getChat: ${msg(e)}`)); }
      try {
        const m = await tg<{ status: string }>("getChatMember", { chat_id: channelId(), user_id: botId });
        rows.push(m.status === "administrator" || m.status === "creator" ? ok("Бот — администратор канала", "да, подписки проверяются") : bad("Бот — администратор канала", `статус «${m.status}»: добавьте бота администратором канала, иначе проверка подписки не работает`));
      } catch (e) { rows.push(bad("Бот — администратор канала", `getChatMember: ${msg(e)}`)); }
    }
  }

  return (
    <>
      {result && <p className={result.startsWith("ok") ? "ok" : "err"} role="status" style={{ fontSize: 14 }}>{result.startsWith("ok") ? "Готово: бот настроен." : `Ошибка: ${result.slice(4)}`}</p>}
      <h2 className="adm-section">Состояние бота</h2>
      <ul className="adm-list">
        {rows.map((r) => (
          <li key={r.label} className="adm-card" style={{ gap: 4 }}>
            <div className="adm-title"><strong>{r.label}</strong><span className="chip" style={r.ok === false ? { background: "rgba(229,72,77,.2)" } : r.ok ? { background: "rgba(52,213,138,.2)" } : undefined}>{r.ok === null ? "—" : r.ok ? "ок" : "нужно исправить"}</span></div>
            <p className="note" style={{ margin: 0 }}>{r.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="adm-section">Настройка</h2>
      <div className="adm-card adm-form">
        <p className="note" style={{ margin: 0 }}>Кнопка ниже устанавливает вебхук на <b>{expected}</b>, команды бота (/start, /alarm, /help), кнопку меню «Опора» и описание. Её можно нажимать повторно. Перед этим добавьте в Vercel переменные и сделайте Redeploy.</p>
        <form action={setupTelegramBot}><button className="primary">Установить бота</button></form>
        <form action={removeTelegramWebhook}><button className="btn-plain btn-danger">Снять вебхук (выключить бота)</button></form>
      </div>
      <p className="note">Мини-приложение открывается по адресу <b>{origin}/tg</b>. Режим «Тревога» (<b>{origin}/alarm</b>) всегда доступен без подписки.</p>
    </>
  );
}
