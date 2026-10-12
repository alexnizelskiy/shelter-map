// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-bot.mjs
import { handleUpdate, TEXT } from "../src/lib/bot.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

const run = async (update, o = {}) => {
  const calls = [];
  await handleUpdate(update, {
    api: async (method, params) => { calls.push({ method, params }); },
    subscribed: o.subscribed ?? (async () => true),
    origin: "https://oporamap.ru", channelLink: o.channelLink ?? "https://t.me/opora_news",
    gate: o.gate ?? true, urgent: o.urgent ?? true, log: () => {},
    track: async (e) => { (o.events ??= []).push(e); },
    blocked: async (id) => { (o.blockedIds ??= []).push(id); },
  });
  return calls;
};
const msg = (text, extra = {}) => ({ message: { chat: { id: 1, type: "private" }, from: { id: 42 }, text, ...extra } });
const buttons = (c) => (c.params.reply_markup?.inline_keyboard ?? []).flat();

// /start: подписан
let c = await run(msg("/start"));
t("/start подписчику: приветствие и кнопка мини-приложения", c.length === 1 && c[0].params.text === TEXT.welcome && buttons(c[0]).some((b) => b.web_app?.url === "https://oporamap.ru/tg"));
t("/start подписчику: есть кнопка «Тревога»", buttons(c[0]).some((b) => b.web_app?.url === "https://oporamap.ru/alarm"));

// /start: не подписан
c = await run(msg("/start"), { subscribed: async () => false });
t("/start без подписки: просим подписаться", c[0].params.text === TEXT.needSub);
t("…кнопка «Подписаться» ведёт на канал", buttons(c[0]).some((b) => b.url === "https://t.me/opora_news"));
t("…кнопка проверки", buttons(c[0]).some((b) => b.callback_data === "check"));
t("…кнопка «Срочно» без подписки", buttons(c[0]).some((b) => b.web_app?.url === "https://oporamap.ru/alarm"));
t("…мини-приложение без подписки не предлагается", !buttons(c[0]).some((b) => b.web_app?.url === "https://oporamap.ru/tg"));

// сбой проверки: пускаем
c = await run(msg("/start"), { subscribed: async () => { throw new Error("chat not found"); } });
t("сбой проверки подписки: пускаем (доступ важнее)", c[0].params.text === TEXT.welcome);

// проверка выключена
c = await run(msg("/start"), { gate: false, subscribed: async () => false });
t("без канала проверка выключена", c[0].params.text === TEXT.welcome);

// кнопку «Срочно» можно отключить
c = await run(msg("/start"), { subscribed: async () => false, urgent: false });
t("urgent=false: кнопки «Срочно» нет", !buttons(c[0]).some((b) => b.web_app?.url === "https://oporamap.ru/alarm"));

// без ссылки на канал кнопки «Подписаться» нет
c = await run(msg("/start"), { subscribed: async () => false, channelLink: "" });
t("нет ссылки на канал: нет кнопки «Подписаться», проверка остаётся", !buttons(c[0]).some((b) => b.url) && buttons(c[0]).some((b) => b.callback_data === "check"));

// /alarm работает всем и без проверки
c = await run(msg("/alarm"), { subscribed: async () => false });
t("/alarm открывается без подписки", buttons(c[0]).some((b) => b.web_app?.url === "https://oporamap.ru/alarm"));
t("/help", (await run(msg("/help")))[0].params.text === TEXT.help);
t("команда с @именем бота: /start@opora_bot", (await run(msg("/start@opora_bot")))[0].params.text === TEXT.welcome);
t("прочий текст → подсказка", (await run(msg("привет")))[0].params.text === TEXT.other);
t("групповые чаты игнорируются", (await run({ message: { chat: { id: 5, type: "supergroup" }, from: { id: 1 }, text: "/start" } })).length === 0);

// кнопка «Я подписался»
const cb = { callback_query: { id: "q1", from: { id: 42 }, data: "check", message: { chat: { id: 1 }, message_id: 77 } } };
c = await run(cb, { subscribed: async () => false });
t("проверка: не подписан → предупреждение", c.length === 1 && c[0].method === "answerCallbackQuery" && c[0].params.show_alert === true && c[0].params.text === TEXT.notYet);
c = await run(cb);
t("проверка: подписан → сообщение заменяется кнопкой открытия", c.map((x) => x.method).join() === "answerCallbackQuery,editMessageText" && buttons(c[1]).some((b) => b.web_app?.url === "https://oporamap.ru/tg"));
c = await run({ callback_query: { id: "q2", from: { id: 42 }, data: "other" } });
t("чужие callback_data игнорируются", c.length === 0);

// учёт людей и метки ссылок
let o = {};
await run(msg("/start vk_post_12"), o);
t("/start метка: событие start с меткой", o.events[0].kind === "start" && o.events[0].source === "vk_post_12" && o.events[0].userId === "42" && o.events[0].chatId === "1");
t("…и результат проверки подписки (sub_ok)", o.events.some((e) => e.kind === "sub_ok" && e.source === "vk_post_12"));
o = {};
await run(msg("/start"), { ...o, subscribed: async () => false, events: (o.events = []) });
t("/start без метки: источник пустой", o.events[0].kind === "start" && !o.events[0].source);
t("…не подписан → sub_no", o.events.some((e) => e.kind === "sub_no"));
o = { gate: false };
await run(msg("/start"), o);
t("проверка подписки выключена: sub_* не пишем", !o.events.some((e) => e.kind.startsWith("sub_")));
o = {};
c = await run(msg("/stop"), o);
t("/stop: событие stop и ответ", o.events[0].kind === "stop" && c[0].params.text === TEXT.stopped);
o = {};
c = await run(msg("/notify"), o);
t("/notify: событие resume и ответ", o.events[0].kind === "resume" && c[0].params.text === TEXT.resumed);
c = await run(msg("/id"));
t("/id: показывает идентификатор", c[0].params.text.includes("42"));
o = {};
await run(msg("/alarm"), o);
t("/alarm: учёт открытия", o.events[0].kind === "open");
o = {};
await run({ my_chat_member: { chat: { id: 7, type: "private" }, from: { id: 42 }, new_chat_member: { status: "kicked" } } }, o);
t("заблокировал бота: помечается", o.blockedIds?.[0] === "42");
o = {};
await run({ my_chat_member: { chat: { id: 7, type: "private" }, from: { id: 42 }, new_chat_member: { status: "member" } } }, o);
t("разблокировал: не помечается", !o.blockedIds?.length);
t("приветствие предупреждает про сообщения и /stop", TEXT.welcome.includes("/stop"));
if (bad) process.exitCode = 1;
