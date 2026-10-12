import { headers } from "next/headers";
import { siteOrigin } from "@/lib/chat-auth";
import { maxApi, maxChannelId, maxChannelLink, maxGateEnabled, maxToken, maxUsername, maxWebhookSecret } from "@/lib/max";
import { removeMaxWebhook, setupMaxBot } from "./actions";

type Row = { label: string; ok: boolean | null; text: string };
const ok = (label: string, text: string): Row => ({ label, ok: true, text });
const bad = (label: string, text: string): Row => ({ label, ok: false, text });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

export default async function BotMax() {
  const origin = siteOrigin(new Request("http://x", { headers: await headers() }));
  const expected = `${origin}/api/bot/max`;
  const rows: Row[] = [];

  rows.push(maxToken() ? ok("Токен бота", "задан (MAX_BOT_TOKEN)") : bad("Токен бота", "не задан: добавьте MAX_BOT_TOKEN в Vercel и сделайте Redeploy"));
  rows.push(maxUsername() ? ok("Имя бота", maxUsername()) : bad("Имя бота", "не задано: NEXT_PUBLIC_MAX_BOT (имя бота из ссылки max.ru/имя)"));
  rows.push(/^[A-Za-z0-9-]{5,256}$/.test(maxWebhookSecret()) ? ok("Секрет вебхука", "задан (MAX_WEBHOOK_SECRET)") : bad("Секрет вебхука", "не задан или неверный: MAX_WEBHOOK_SECRET, 5–256 символов, только латиница, цифры и дефис"));
  rows.push(maxGateEnabled() ? ok("Канал для подписки", `${maxChannelId()}${maxChannelLink() ? ` · ${maxChannelLink()}` : " · ссылка не задана (MAX_CHANNEL_LINK)"}`) : { label: "Канал для подписки", ok: null, text: "не задан: проверка подписки выключена, карта открывается всем (MAX_CHANNEL_ID — числовой id канала)" });

  let chats: { chat_id: number | string; title?: string; type?: string }[] = [];
  if (maxToken()) {
    // запросы идут одновременно: если MAX недоступен, страница ждёт один таймаут, а не четыре подряд
    const [me, subs, ch, chan] = await Promise.allSettled([
      maxApi<{ name?: string; username?: string; user_id?: number }>("GET", "/me"),
      maxApi<{ subscriptions?: { url?: string }[] }>("GET", "/subscriptions"),
      maxApi<{ chats?: { chat_id: number | string; title?: string; type?: string }[] }>("GET", "/chats", { query: { count: 50 } }),
      maxGateEnabled() ? maxApi("GET", `/chats/${maxChannelId()}`) : Promise.resolve(null),
    ]);
    if (me.status === "fulfilled") rows.push(ok("Связь с MAX", `бот «${me.value.name ?? me.value.username ?? me.value.user_id}» отвечает`));
    else rows.push(bad("Связь с MAX", `GET /me: ${msg(me.reason)}`));
    if (subs.status === "fulfilled") {
      const list = subs.value.subscriptions ?? [];
      if (!list.length) rows.push(bad("Вебхук", "не установлен: нажмите «Установить бота MAX»"));
      else if (!list.some((s) => s.url === expected)) rows.push(bad("Вебхук", `смотрит на другой адрес: ${list.map((s) => s.url).join(", ")}`));
      else rows.push(ok("Вебхук", "установлен"));
    } else rows.push(bad("Вебхук", `GET /subscriptions: ${msg(subs.reason)}`));
    if (ch.status === "fulfilled") chats = ch.value.chats ?? []; // список чатов нужен только как подсказка
    if (maxGateEnabled()) rows.push(chan.status === "fulfilled" ? ok("Канал найден", maxChannelId()) : bad("Канал найден", `GET /chats/${maxChannelId()}: ${msg(chan.reason)}`));
  }

  return (
    <>
      <h2 className="adm-section">Состояние бота MAX</h2>
      <ul className="adm-list">
        {rows.map((r) => (
          <li key={r.label} className="adm-card" style={{ gap: 4 }}>
            <div className="adm-title"><strong>{r.label}</strong><span className="chip" style={r.ok === false ? { background: "rgba(229,72,77,.2)" } : r.ok ? { background: "rgba(52,213,138,.2)" } : undefined}>{r.ok === null ? "—" : r.ok ? "ок" : "нужно исправить"}</span></div>
            <p className="note" style={{ margin: 0 }}>{r.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="adm-section">Настройка MAX</h2>
      <div className="adm-card adm-form">
        <p className="note" style={{ margin: 0 }}>Кнопка ниже подписывает бота на события (запуск, сообщения, нажатия кнопок, блокировка) по адресу <b>{expected}</b> и ставит команды и описание. Адрес мини-приложения, который нужно указать в настройках бота на платформе MAX (Чат-боты → Настройки бота): <b>{origin}/max</b>.</p>
        <form action={setupMaxBot}><button className="primary">Установить бота MAX</button></form>
        <form action={removeMaxWebhook}><button className="btn-plain btn-danger">Снять вебхук (выключить бота)</button></form>
      </div>
      {chats.length > 0 && (
        <>
          <h2 className="adm-section">Чаты и каналы бота в MAX</h2>
          <p className="note">Бот должен быть администратором канала. Числовой id нужного канала скопируйте в переменную MAX_CHANNEL_ID.</p>
          <ul className="adm-list">
            {chats.map((c) => <li key={String(c.chat_id)} className="adm-card" style={{ gap: 2 }}><div className="adm-title"><strong>{c.title ?? "без названия"}</strong><span className="chip">{c.type ?? "chat"}</span></div><p className="note" style={{ margin: 0 }}>id: {String(c.chat_id)}</p></li>)}
          </ul>
        </>
      )}
    </>
  );
}
