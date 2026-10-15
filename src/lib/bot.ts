// Логика бота «Опора» в Telegram: проверка подписки на канал и кнопки открытия мини-приложения.
// Зависимости (вызов API, проверка подписки, учёт людей) передаются снаружи, поэтому обработчик проверяется тестами без сети.
import type { BotEventKind } from "./bot-users";

export type Update = {
  message?: { chat: { id: number; type: string }; from?: { id: number; language_code?: string }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
  my_chat_member?: { chat: { id: number; type: string }; from: { id: number }; new_chat_member?: { status?: string } };
};

export type BotDeps = {
  api: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  subscribed: (userId: number) => Promise<boolean>; // бросает исключение, если проверить не удалось
  origin: string; // https://oporamap.ru
  channelLink: string;
  gate: boolean; // включена ли проверка подписки
  urgent: boolean; // кнопка «Срочно» без подписки
  track?: (e: { kind: BotEventKind; userId: string; chatId?: string; source?: string; lang?: string }) => Promise<void>;
  blocked?: (userId: string) => Promise<void>;
  log?: (msg: string, e?: unknown) => void;
};

const APP = (o: string) => `${o}/tg`;
const ALARM = (o: string) => `${o}/alarm`;

const openKeyboard = (d: BotDeps) => ({
  inline_keyboard: [
    [{ text: "Открыть карту", web_app: { url: APP(d.origin) } }],
    ...(d.urgent ? [[{ text: "🚨 Режим «Тревога»", web_app: { url: ALARM(d.origin) } }]] : []),
  ],
});

const subscribeKeyboard = (d: BotDeps) => ({
  inline_keyboard: [
    ...(d.channelLink ? [[{ text: "Подписаться на канал", url: d.channelLink }]] : []),
    [{ text: "Я подписался — проверить", callback_data: "check" }],
    ...(d.urgent ? [[{ text: "🚨 Срочно — без подписки", web_app: { url: ALARM(d.origin) } }]] : []),
  ],
});

export const TEXT = {
  welcome: "Это «Опора» — карта укрытий. Покажу ближайшее укрытие, маршрут и чат жителей.\n\nНажмите кнопку, чтобы открыть карту.\n\nИногда будем присылать важные сообщения. Отключить: /stop",
  needSub: "Чтобы открыть карту, подпишитесь на наш канал, а затем нажмите «Я подписался — проверить».\n\nЕсли нужно срочно, откройте режим «Тревога» кнопкой ниже: он работает без подписки.",
  notYet: "Подписку пока не вижу. Подпишитесь на канал и нажмите кнопку ещё раз.",
  ok: "Спасибо! Подписка подтверждена. Нажмите кнопку, чтобы открыть карту.",
  alarm: "Режим «Тревога»: ближайшее укрытие, расстояние и направление. Работает без подписки и без сети.",
  help: "Команды:\n/start — открыть карту\n/alarm — режим «Тревога»\n/stop — не присылать сообщения\n/notify — снова присылать сообщения\n/help — помощь\n\nИнформация носит справочный характер. Следуйте оповещениям МЧС.",
  stopped: "Хорошо, больше не буду присылать сообщения. Карта и режим «Тревога» по-прежнему доступны. Вернуть сообщения: /notify",
  resumed: "Готово, снова буду присылать важные сообщения. Отключить: /stop",
  other: "Нажмите /start, чтобы открыть карту, или /alarm для режима «Тревога».",
  loginOk: "Готово! Вы вошли в чат на сайте. Вернитесь в браузер: вход подтвердится сам, через пару секунд.",
  loginBad: "Ссылка для входа устарела или уже использована. Вернитесь на сайт, откройте чат и нажмите «MAX» ещё раз.",
};

// Подписка: true/false или null, если проверить не удалось (тогда пускаем: в чрезвычайной ситуации доступ важнее строгой проверки)
async function check(d: BotDeps, userId: number): Promise<boolean | null> {
  if (!d.gate) return true;
  try { return await d.subscribed(userId); }
  catch (e) { d.log?.("subscription check failed", e); return null; }
}

// Метка ссылки: t.me/бот?start=метка приходит как «/start метка»
const startSource = (text: string) => text.trim().split(/\s+/)[1] ?? "";

export async function handleUpdate(u: Update, d: BotDeps): Promise<void> {
  // человек заблокировал бота
  if (u.my_chat_member) {
    const c = u.my_chat_member;
    if (c.chat.type !== "private") return;
    const st = c.new_chat_member?.status;
    if (st === "kicked" || st === "left") await d.blocked?.(String(c.from.id));
    return;
  }

  // сообщения
  if (u.message) {
    const m = u.message;
    if (m.chat.type !== "private" || !m.from) return;
    const text = (m.text ?? "").trim();
    const cmd = text.split(/[\s@]/)[0].toLowerCase();
    const userId = String(m.from.id);
    const chatId = String(m.chat.id);
    const lang = m.from.language_code;

    if (cmd === "/alarm") {
      await d.track?.({ kind: "open", userId, chatId, lang });
      await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.alarm, reply_markup: { inline_keyboard: [[{ text: "🚨 Открыть режим «Тревога»", web_app: { url: ALARM(d.origin) } }]] } });
      return;
    }
    if (cmd === "/help") { await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.help }); return; }
    if (cmd === "/id") { await d.api("sendMessage", { chat_id: m.chat.id, text: `Ваш ID в Telegram: ${userId}` }); return; }
    if (cmd === "/stop") { await d.track?.({ kind: "stop", userId, chatId, lang }); await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.stopped }); return; }
    if (cmd === "/notify") { await d.track?.({ kind: "resume", userId, chatId, lang }); await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.resumed }); return; }
    if (cmd === "/start" || cmd === "/map") {
      const source = startSource(text);
      await d.track?.({ kind: "start", userId, chatId, source, lang });
      const sub = await check(d, m.from.id);
      if (sub !== null && d.gate) await d.track?.({ kind: sub ? "sub_ok" : "sub_no", userId, chatId, source });
      if (sub === false) await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.needSub, reply_markup: subscribeKeyboard(d) });
      else await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.welcome, reply_markup: openKeyboard(d) });
      return;
    }
    await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.other });
    return;
  }

  // нажатие «Я подписался — проверить»
  const q = u.callback_query;
  if (q && q.data === "check") {
    const sub = await check(d, q.from.id);
    if (sub !== null && d.gate) await d.track?.({ kind: sub ? "sub_ok" : "sub_no", userId: String(q.from.id), chatId: q.message ? String(q.message.chat.id) : undefined });
    if (sub === false) {
      await d.api("answerCallbackQuery", { callback_query_id: q.id, text: TEXT.notYet, show_alert: true });
      return;
    }
    await d.api("answerCallbackQuery", { callback_query_id: q.id });
    if (q.message) await d.api("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: TEXT.ok, reply_markup: openKeyboard(d) });
  }
}
