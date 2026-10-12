// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-max-bot.mjs
import { handleMaxUpdate } from "../src/lib/max-bot.ts";
import { TEXT } from "../src/lib/bot.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

const run = async (update, o = {}) => {
  const sent = [], answers = [], events = [], blocked = [];
  await handleMaxUpdate(update, {
    send: async (userId, text, rows = []) => { sent.push({ userId, text, rows }); },
    answer: async (id, text) => { answers.push({ id, text }); },
    subscribed: o.subscribed ?? (async () => true),
    track: async (e) => { events.push(e); },
    blocked: async (id) => { blocked.push(id); },
    origin: "https://oporamap.ru", channelLink: o.channelLink ?? "https://max.ru/opora_news",
    gate: o.gate ?? true, urgent: o.urgent ?? true, log: () => {},
  });
  return { sent, answers, events, blocked };
};
const btns = (m) => m.rows.flat();
const started = (payload) => ({ update_type: "bot_started", user: { user_id: 77, first_name: "Анна" }, chat_id: 5, payload, user_locale: "ru" });
const msg = (text, extra = {}) => ({ update_type: "message_created", message: { sender: { user_id: 77 }, recipient: { chat_id: 5, chat_type: "dialog" }, body: { text }, ...extra } });

let r = await run(started("vk_post_12"));
t("bot_started: приветствие и кнопка карты", r.sent.length === 1 && r.sent[0].text === TEXT.welcome && btns(r.sent[0]).some((b) => b.type === "link" && b.url === "https://oporamap.ru/"));
t("…кнопка «Тревога»", btns(r.sent[0]).some((b) => b.url === "https://oporamap.ru/alarm"));
t("…событие start с меткой и языком", r.events[0].kind === "start" && r.events[0].source === "vk_post_12" && r.events[0].userId === "77" && r.events[0].lang === "ru");
t("…подписан → sub_ok", r.events.some((e) => e.kind === "sub_ok"));

r = await run(started(undefined), { subscribed: async () => false });
t("не подписан: просим подписаться, есть проверка и канал", r.sent[0].text === TEXT.needSub && btns(r.sent[0]).some((b) => b.type === "callback" && b.payload === "check") && btns(r.sent[0]).some((b) => b.url === "https://max.ru/opora_news"));
t("…без метки источник пустой, sub_no записан", !r.events[0].source && r.events.some((e) => e.kind === "sub_no"));
t("…«Тревога» без подписки есть, карты в обход нет", btns(r.sent[0]).some((b) => b.url === "https://oporamap.ru/alarm") && !btns(r.sent[0]).some((b) => b.url === "https://oporamap.ru/"));

r = await run(started(undefined), { subscribed: async () => { throw new Error("нет прав"); } });
t("сбой проверки: пускаем", r.sent[0].text === TEXT.welcome && !r.events.some((e) => e.kind.startsWith("sub_")));
r = await run(started(undefined), { gate: false, subscribed: async () => false });
t("без канала проверки нет", r.sent[0].text === TEXT.welcome);
t("бот-пользователь игнорируется", (await run({ update_type: "bot_started", user: { user_id: 5, is_bot: true } })).sent.length === 0);

r = await run(msg("/start spring"));
t("/start метка в тексте", r.events[0].source === "spring" && r.sent[0].text === TEXT.welcome);
r = await run(msg("/alarm"), { subscribed: async () => false });
t("/alarm без подписки", btns(r.sent[0]).some((b) => b.url === "https://oporamap.ru/alarm") && r.events[0].kind === "open");
t("/help", (await run(msg("/help"))).sent[0].text === TEXT.help);
t("/id показывает идентификатор", (await run(msg("/id"))).sent[0].text.includes("77"));
r = await run(msg("/stop"));
t("/stop: событие и ответ", r.events[0].kind === "stop" && r.sent[0].text === TEXT.stopped);
r = await run(msg("/notify"));
t("/notify: событие и ответ", r.events[0].kind === "resume" && r.sent[0].text === TEXT.resumed);
t("прочий текст → подсказка", (await run(msg("привет"))).sent[0].text === TEXT.other);
t("групповые чаты игнорируются", (await run({ update_type: "message_created", message: { sender: { user_id: 1 }, recipient: { chat_type: "chat" }, body: { text: "/start" } } })).sent.length === 0);

const cb = (payload) => ({ update_type: "message_callback", callback: { callback_id: "cb1", payload, user: { user_id: 77 } } });
r = await run(cb("check"), { subscribed: async () => false });
t("проверка: не подписан → всплывающий ответ", r.answers.length === 1 && r.answers[0].text === TEXT.notYet && r.sent.length === 0);
r = await run(cb("check"));
t("проверка: подписан → сообщение с кнопкой карты", r.sent[0].text === TEXT.ok && btns(r.sent[0]).some((b) => b.url === "https://oporamap.ru/"));
t("чужой callback игнорируется", (await run(cb("other"))).sent.length === 0);

r = await run({ update_type: "bot_stopped", user: { user_id: 77 }, chat_id: 5 });
t("bot_stopped: человек помечается заблокировавшим", r.blocked[0] === "77");
r = await run({ update_type: "dialog_removed", user: { user_id: 78 } });
t("dialog_removed: тоже", r.blocked[0] === "78");
if (bad) process.exitCode = 1;
