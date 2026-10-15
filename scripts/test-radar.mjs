// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-radar.mjs
// «Радар»: разбор страницы канала, удаление подписи, фильтр рекламы, регион
import { cleanText, isAd, parseChannelHtml, regionOf, toRadarPost } from "../src/lib/radar-parse.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

// подпись канала в том виде, как её отдаёт публичная страница
const SIG = `<br/><br/><i class="emoji" style="background-image:url('//telegram.org/img/emoji/40/E29D97.png')"><b>❗️</b></i>Радар по всей России - <a href="https://t.me/radarrussiia" target="_blank">@radarrussiia</a><br/><tg-emoji emoji-id="1"><i class="emoji"><b>📲</b></i></tg-emoji> Наш канал в МАХ - <br/><a href="https://max.ru/x" target="_blank">https://max.ru/join/radarrussiia</a>`;
const post = (id, at, body, extra = "") => `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap" data-post="radarrussiia/${id}">${extra}<div class="tgme_widget_message_text js-message_text" dir="auto">${body}</div><a class="tgme_widget_message_date"><time datetime="${at}" class="time">21:44</time></a></div></div>`;

const page = [
  post(1, "2026-10-15T18:44:15+00:00", `Алексин<br/>Тульская область<br/>Работа ПВО по БПЛА${SIG}`),
  post(2, "2026-10-15T18:45:11+00:00", `Ростов-на-Дону<br/>Ростовская область &amp; окрестности<br/>Фиксация БПЛА ${SIG}`),
  post(3, "2026-10-15T18:46:00+00:00", `Скидка 20% на пиццу! Закажите по ссылке <a href="https://pizza.example">pizza.example</a>${SIG}`),
  post(4, "2026-10-15T18:47:00+00:00", `Реклама. Казино, ставки. erid: 2VtzqwXXXX`),
  post(5, "2026-10-15T18:48:00+00:00", `Подписывайтесь на @best_channel — там интереснее`),
  `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="radarrussiia/6"><a class="tgme_widget_message_photo_wrap"></a><a class="tgme_widget_message_date"><time datetime="2026-10-15T18:49:00+00:00"></time></a></div></div>`,
  post(7, "2026-10-15T18:50:00+00:00", `Только подпись${SIG}`.replace("Только подпись", "")),
  post(8, "not-a-date", "Москва<br/>Сбой даты"),
].join("\n");

const raws = parseChannelHtml(page);
t("разбор: посты с текстом, номером и временем (без картинок и с битой датой)", raws.map((r) => r.id).join() === "1,2,3,4,5,7", raws.map((r) => r.id).join());
t("время приводится к ISO UTC", raws[0].at === "2026-10-15T18:44:15.000Z");

const posts = raws.map(toRadarPost);
t("подпись канала удалена целиком", posts[0].text === "Алексин\nТульская область\nРабота ПВО по БПЛА", JSON.stringify(posts[0]?.text));
t("в тексте нет ссылок и упоминаний канала", !/radarrussiia|max\.ru|t\.me|Наш канал|Радар по всей/i.test(posts.filter(Boolean).map((p) => p.text).join(" ")));
t("сущности HTML раскодированы, хвостовые пробелы убраны", posts[1].text === "Ростов-на-Дону\nРостовская область & окрестности\nФиксация БПЛА", JSON.stringify(posts[1]?.text));
t("реклама со ссылкой и скидкой отброшена", posts[2] === null);
t("реклама с маркировкой erid и казино отброшена", posts[3] === null);
t("призыв подписаться и упоминание чужого канала отброшены", posts[4] === null);
t("пост из одной подписи (пустой после очистки) отброшен", posts[5] === null);

t("регион определяется по первым строкам", regionOf("Алексин\nТульская область\nРабота ПВО") === "Тульская область" && regionOf("Москва\nУгроза") === "Москва" && regionOf("Крым\nРеспублика Крым") === "Республика Крым" && regionOf("Просто текст") === "");
t("регион: из поста про Ростов", posts[1].region === "Ростовская область & окрестности".slice(0, 60) || posts[1].region.startsWith("Ростовская область"));

t("фильтр рекламы: обычные сообщения радара проходят", !isAd("Таганрог\nРостовская область\nОпасность атаки БПЛА") && !isAd("Орел\nОрловская область\nФиксация группы БПЛА\nМеры безопасности"));
t("фильтр рекламы: типичные рекламные признаки", ["Промокод РАДАР на скидку", "Розыгрыш призов", "Купите сейчас", "https://example.com", "@somebot", "Кредит под 5%"].every(isAd));
t("очистка текста: разные переносы и пробелы", cleanText("А<br/> Б <br/><br/><br/>В") === "А\nБ\n\nВ");
if (bad) process.exitCode = 1;
