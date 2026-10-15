// Логика бота «Опора» в MAX: проверка подписки на канал и кнопки. Зависимости передаются снаружи — обработчик проверяется тестами без сети.
import { TEXT } from "./bot";
import type { MaxButton } from "./max";
import type { BotEventKind } from "./bot-users";
import { parseLoginText } from "./login-codes";

type MaxUser = { user_id?: number | string; id?: number | string; first_name?: string; last_name?: string; avatar_url?: string; full_avatar_url?: string; is_bot?: boolean };

export type MaxUpdate = {
  update_type?: string;
  chat_id?: number | string;
  is_channel?: boolean;
  user?: MaxUser;
  payload?: string;
  user_locale?: string;
  message?: { sender?: MaxUser; recipient?: { chat_id?: number | string; chat_type?: string; user_id?: number | string }; body?: { text?: string } };
  callback?: { callback_id?: string; payload?: string; user?: MaxUser };
};

export type MaxDeps = {
  send: (userId: string, text: string, rows?: MaxButton[][]) => Promise<void>;
  answer: (callbackId: string, notification: string) => Promise<void>;
  subscribed: (userId: string) => Promise<boolean>; // бросает исключение, если проверить не удалось
  track: (e: { kind: BotEventKind; userId: string; chatId?: string; source?: string; lang?: string }) => Promise<void>;
  blocked: (userId: string) => Promise<void>;
  login?: (code: string, who: { extId: string; firstName: string; lastName: string; avatar: string | null }) => Promise<boolean>; // подтверждение входа в чат на сайте
  origin: string;
  channelLink: string;
  gate: boolean;
  urgent: boolean;
  log?: (msg: string, e?: unknown) => void;
};

const uid = (u?: MaxUser) => (u && (u.user_id ?? u.id) != null ? String(u.user_id ?? u.id) : "");

const openKeyboard = (d: MaxDeps): MaxButton[][] => [
  [{ type: "link", text: "Открыть карту", url: `${d.origin}/` }],
  ...(d.urgent ? [[{ type: "link", text: "🚨 Режим «Тревога»", url: `${d.origin}/alarm` } as MaxButton]] : []),
];

const subscribeKeyboard = (d: MaxDeps): MaxButton[][] => [
  ...(d.channelLink ? [[{ type: "link", text: "Подписаться на канал", url: d.channelLink } as MaxButton]] : []),
  [{ type: "callback", text: "Я подписался — проверить", payload: "check" }],
  ...(d.urgent ? [[{ type: "link", text: "🚨 Срочно — без подписки", url: `${d.origin}/alarm` } as MaxButton]] : []),
];

// Метка ссылки из /start метка (bot_started.payload или текст «/start метка»)
const src = (v: string | undefined) => (v ?? "").trim().split(/\s+/)[0];

async function check(d: MaxDeps, userId: string): Promise<boolean | null> {
  if (!d.gate) return true;
  try { return await d.subscribed(userId); }
  catch (e) { d.log?.("max subscription check failed", e); return null; }
}

// Вход в чат на сайте: бот подтверждает код от имени человека
async function confirmLogin(d: MaxDeps, userId: string, user: MaxUser | undefined, code: string) {
  await d.track({ kind: "start", userId, chatId: userId });
  const avatar = user?.full_avatar_url ?? user?.avatar_url ?? null;
  const ok = d.login ? await d.login(code, { extId: userId, firstName: user?.first_name ?? "", lastName: user?.last_name ?? "", avatar: avatar && /^https:\/\//i.test(avatar) ? avatar : null }) : false;
  await d.send(userId, ok ? TEXT.loginOk : TEXT.loginBad, ok ? [] : [[{ type: "link", text: "Открыть сайт", url: d.origin }]]);
}

async function greet(d: MaxDeps, userId: string, source: string, lang?: string) {
  await d.track({ kind: "start", userId, chatId: userId, source, lang });
  const sub = await check(d, userId);
  if (sub !== null && d.gate) await d.track({ kind: sub ? "sub_ok" : "sub_no", userId, chatId: userId, source });
  if (sub === false) await d.send(userId, TEXT.needSub, subscribeKeyboard(d));
  else await d.send(userId, TEXT.welcome, openKeyboard(d));
}

export async function handleMaxUpdate(u: MaxUpdate, d: MaxDeps): Promise<void> {
  const type = u.update_type;

  // человек нажал «Начать» (или перешёл по ссылке max.ru/бот?start=метка)
  if (type === "bot_started") {
    const userId = uid(u.user);
    if (!userId || u.user?.is_bot) return;
    const login = /^login_([A-Za-z0-9]{10})$/i.exec(u.payload ?? "");
    if (login) { await confirmLogin(d, userId, u.user, login[1].toUpperCase()); return; }
    await greet(d, userId, src(u.payload), u.user_locale);
    return;
  }

  // человек заблокировал бота или удалил диалог
  if (type === "bot_stopped" || type === "dialog_removed") {
    const userId = uid(u.user);
    if (userId) await d.blocked(userId);
    return;
  }

  if (type === "message_created" && u.message) {
    const m = u.message;
    if (m.recipient?.chat_type && m.recipient.chat_type !== "dialog") return; // только личные сообщения
    const userId = uid(m.sender);
    if (!userId || m.sender?.is_bot) return;
    const text = (m.body?.text ?? "").trim();
    const cmd = text.split(/[\s@]/)[0].toLowerCase();

    const loginCode = parseLoginText(text); // «/start login_КОД» или «вход КОД»: для тех, кто уже запускал бота раньше
    if (loginCode) { await confirmLogin(d, userId, m.sender, loginCode); return; }
    if (cmd === "/alarm") { await d.track({ kind: "open", userId, chatId: userId }); await d.send(userId, TEXT.alarm, [[{ type: "link", text: "🚨 Открыть режим «Тревога»", url: `${d.origin}/alarm` }]]); return; }
    if (cmd === "/help") { await d.send(userId, TEXT.help); return; }
    if (cmd === "/id") { await d.send(userId, `Ваш ID в MAX: ${userId}`); return; }
    if (cmd === "/stop") { await d.track({ kind: "stop", userId, chatId: userId }); await d.send(userId, TEXT.stopped); return; }
    if (cmd === "/notify") { await d.track({ kind: "resume", userId, chatId: userId }); await d.send(userId, TEXT.resumed); return; }
    if (cmd === "/start" || cmd === "/map") { await greet(d, userId, src(text.slice(cmd.length)), undefined); return; }
    await d.send(userId, TEXT.other);
    return;
  }

  // нажатие «Я подписался — проверить»
  if (type === "message_callback" && u.callback?.payload === "check") {
    const userId = uid(u.callback.user);
    const cbId = u.callback.callback_id;
    if (!userId || !cbId) return;
    const sub = await check(d, userId);
    if (sub !== null && d.gate) await d.track({ kind: sub ? "sub_ok" : "sub_no", userId, chatId: userId });
    if (sub === false) { await d.answer(cbId, TEXT.notYet); return; }
    await d.send(userId, TEXT.ok, openKeyboard(d));
  }
}
