// Логика бота «Опора» в Telegram: проверка подписки на канал и кнопки открытия мини-приложения.
// Зависимости (вызов API, проверка подписки) передаются снаружи, поэтому обработчик проверяется тестами без сети.

export type Update = {
  message?: { chat: { id: number; type: string }; from?: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
};

export type BotDeps = {
  api: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  subscribed: (userId: number) => Promise<boolean>; // бросает исключение, если проверить не удалось
  origin: string; // https://oporamap.ru
  channelLink: string;
  gate: boolean; // включена ли проверка подписки
  urgent: boolean; // кнопка «Срочно» без подписки
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
  welcome: "Это «Опора» — карта укрытий. Покажу ближайшее укрытие, маршрут и чат жителей.\n\nНажмите кнопку, чтобы открыть карту.",
  needSub: "Чтобы открыть карту, подпишитесь на наш канал, а затем нажмите «Я подписался — проверить».\n\nЕсли нужно срочно, откройте режим «Тревога» кнопкой ниже: он работает без подписки.",
  notYet: "Подписку пока не вижу. Подпишитесь на канал и нажмите кнопку ещё раз.",
  ok: "Спасибо! Подписка подтверждена. Нажмите кнопку, чтобы открыть карту.",
  alarm: "Режим «Тревога»: ближайшее укрытие, расстояние и направление. Работает без подписки и без сети.",
  help: "Команды:\n/start — открыть карту\n/alarm — режим «Тревога»\n/help — помощь\n\nИнформация носит справочный характер. Следуйте оповещениям МЧС.",
  other: "Нажмите /start, чтобы открыть карту, или /alarm для режима «Тревога».",
};

// Подписка: true/false или null, если проверить не удалось (тогда пускаем: в чрезвычайной ситуации доступ важнее строгой проверки)
async function check(d: BotDeps, userId: number): Promise<boolean | null> {
  if (!d.gate) return true;
  try { return await d.subscribed(userId); }
  catch (e) { d.log?.("subscription check failed", e); return null; }
}

export async function handleUpdate(u: Update, d: BotDeps): Promise<void> {
  // сообщения
  if (u.message) {
    const m = u.message;
    if (m.chat.type !== "private" || !m.from) return;
    const text = (m.text ?? "").trim();
    const cmd = text.split(/[\s@]/)[0].toLowerCase();

    if (cmd === "/alarm") {
      await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.alarm, reply_markup: { inline_keyboard: [[{ text: "🚨 Открыть режим «Тревога»", web_app: { url: ALARM(d.origin) } }]] } });
      return;
    }
    if (cmd === "/help") { await d.api("sendMessage", { chat_id: m.chat.id, text: TEXT.help }); return; }
    if (cmd === "/start" || cmd === "/map") {
      const sub = await check(d, m.from.id);
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
    if (sub === false) {
      await d.api("answerCallbackQuery", { callback_query_id: q.id, text: TEXT.notYet, show_alert: true });
      return;
    }
    await d.api("answerCallbackQuery", { callback_query_id: q.id });
    if (q.message) await d.api("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: TEXT.ok, reply_markup: openKeyboard(d) });
  }
}
