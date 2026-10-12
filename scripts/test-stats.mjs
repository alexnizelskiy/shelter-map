// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-stats.mjs
// Проверка схемы ботов и аналитики, запросов статистики, выборки получателей рассылки и очистки на встроенной базе.
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA } from "../src/lib/db.ts";
import { STATS_SQL } from "../src/lib/stats-sql.ts";
import { PURGE_SQL } from "../src/lib/maintenance.ts";
import { cleanSource } from "../src/lib/bot-users.ts";
import { cityFromPath, cleanRef, isBotUa, visitorHash } from "../src/lib/analytics.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

// чистые функции
t("метка: латиница, цифры, _ и -", cleanSource("vk_post-12") === "vk_post-12" && cleanSource("плохо") === "" && cleanSource("a b") === "" && cleanSource("x".repeat(65)) === "" && cleanSource(5) === "");
t("город из пути", cityFromPath("/rostov-na-donu?tab=1") === "rostov-na-donu" && cityFromPath("/alarm") === "" && cityFromPath("/privacy") === "" && cityFromPath("/") === "");
t("домен-источник", cleanRef("yandex.ru") === "ref:yandex.ru" && cleanRef("a b") === "" && cleanRef("") === "");
t("боты определяются", isBotUa("Googlebot/2.1") && isBotUa(null) && !isBotUa("Mozilla/5.0 (iPhone) Safari"));
const h1 = new Headers({ "user-agent": "UA1", "x-forwarded-for": "1.2.3.4" });
const h2 = new Headers({ "user-agent": "UA1", "x-forwarded-for": "5.6.7.8" });
t("хэш посетителя: стабилен в день, различает людей, меняется по дням", visitorHash(h1, "2026-10-12") === visitorHash(h1, "2026-10-12") && visitorHash(h1, "2026-10-12") !== visitorHash(h2, "2026-10-12") && visitorHash(h1, "2026-10-12") !== visitorHash(h1, "2026-10-13"));

const db = new PGlite();
await db.exec(SCHEMA);
const q = async (text, params = []) => (await db.query(text, params)).rows;

// люди: Telegram — 3 (двое по метке), MAX — 1
await db.exec(`
  INSERT INTO bot_users (platform, ext_id, chat_id, source, started, notify, blocked, subscribed, first_seen) VALUES
   ('telegram','1','1','vk_post_12', true, true, false, true, now()),
   ('telegram','2','2','vk_post_12', true, false, false, true, now()),
   ('telegram','3','3','',           true, true, true,  false, now() - interval '5 days'),
   ('telegram','4',NULL,'',          false, true, false, NULL, now()),
   ('max','10','10','spring',        true, true, false, true, now());
  INSERT INTO bot_activity (user_id, day) SELECT id, (now() AT TIME ZONE 'Europe/Moscow')::date FROM bot_users WHERE ext_id IN ('1','10');
  INSERT INTO bot_activity (user_id, day) SELECT id, (now() AT TIME ZONE 'Europe/Moscow')::date - 3 FROM bot_users WHERE ext_id = '3';
  INSERT INTO bot_activity (user_id, day) SELECT id, (now() AT TIME ZONE 'Europe/Moscow')::date - 4 FROM bot_users WHERE ext_id = '3';
  INSERT INTO bot_events (user_id, kind, source) SELECT id, 'start', source FROM bot_users WHERE started;
  INSERT INTO site_hits (day, visitor, source, channel, city) VALUES
   ((now() AT TIME ZONE 'Europe/Moscow')::date, 'a', 'vk_post_12', 'web', 'rostov-na-donu'),
   ((now() AT TIME ZONE 'Europe/Moscow')::date, 'b', '',           'tg',  'rostov-na-donu'),
   ((now() AT TIME ZONE 'Europe/Moscow')::date - 1, 'c', 'ref:yandex.ru', 'web', '');
  INSERT INTO chat_users (provider, ext_id, first_name, source) VALUES ('telegram','1','Анна','vk_post_12'), ('yandex','9','Иван','');`);

const today = (await q(STATS_SQL.today))[0];
t("сегодня: посетители сайта", today.web === 2);
t("сегодня: активные по платформам", today.tg_active === 1 && today.max_active === 1);
t("сегодня: новые в ботах", today.tg_new === 3 && today.max_new === 1, JSON.stringify(today));
t("сегодня: новые профили чата", today.chat_new === 2);
const series = await q(STATS_SQL.series);
t("по дням: 14 строк, свежие сверху", series.length === 14 && series[0].web === 2 && series[1].web === 1);
t("по дням: активные в ботах", series[0].bot === 2);
const web = await q(STATS_SQL.webBySource);
t("посетители по меткам", web.length === 3 && web.find((r) => r.source === "vk_post_12")?.n === 1 && web.find((r) => r.source === "ref:yandex.ru")?.n === 1);
const starts = await q(STATS_SQL.startsBySource);
t("запуски бота по меткам (людей)", starts.find((r) => r.source === "vk_post_12")?.people === 2 && starts.find((r) => r.source === "spring")?.n === 1);
t("новые в ботах по первой метке", (await q(STATS_SQL.firstBySource)).find((r) => r.source === "vk_post_12")?.n === 2);
t("регистрации в чате по меткам", (await q(STATS_SQL.chatBySource)).find((r) => r.source === "vk_post_12")?.n === 1);
const pl = await q(STATS_SQL.platforms);
const tgp = pl.find((r) => r.platform === "telegram");
t("платформы: Telegram", tgp.total === 4 && tgp.started === 3 && tgp.reachable === 1 && tgp.blocked === 1 && tgp.subscribed === 2 && tgp.not_subscribed === 1 && tgp.only_app === 1, JSON.stringify(tgp));
t("каналы и города", (await q(STATS_SQL.channels)).length === 2 && (await q(STATS_SQL.cities))[0].city === "rostov-na-donu");
t("провайдеры чата", (await q(STATS_SQL.chatProviders)).length === 2);
const ret = (await q(STATS_SQL.retention))[0];
t("возвращаемость: вернулся один из одного старого", ret.total === 1 && ret.returned === 1, JSON.stringify(ret));

// выборка получателей рассылки: started, не отключили, не заблокировали, есть chat_id; фильтр по метке и платформам
const pick = (platforms, source) => q(`SELECT ext_id FROM bot_users WHERE started AND notify AND NOT blocked AND chat_id IS NOT NULL AND platform = ANY($1) AND ($2::text IS NULL OR source = $2) ORDER BY ext_id`, [platforms, source]);
t("рассылка: все платформы", (await pick(["telegram", "max"], null)).map((r) => r.ext_id).join() === "1,10");
t("рассылка: только MAX", (await pick(["max"], null)).map((r) => r.ext_id).join() === "10");
t("рассылка: по метке", (await pick(["telegram", "max"], "vk_post_12")).map((r) => r.ext_id).join() === "1");

// upsert людей: повторный запуск не создаёт дубль, xmax показывает новую запись
const up = (ext) => q(`INSERT INTO bot_users (platform, ext_id, chat_id, source, started, opens) VALUES ('telegram',$1,'1','',true,1)
  ON CONFLICT (platform, ext_id) DO UPDATE SET opens = bot_users.opens + 1, blocked = CASE WHEN EXCLUDED.started THEN false ELSE bot_users.blocked END
  RETURNING id::text, (xmax = 0) AS "isNew", blocked`, [ext]);
t("upsert: новая запись помечена isNew", (await up("500"))[0].isNew === true);
t("upsert: повтор — не новая", (await up("500"))[0].isNew === false);
t("upsert: повторный /start снимает блокировку", (await up("3"))[0].blocked === false);

// рассылка: доставки и прогресс
await db.exec(`INSERT INTO broadcasts (text, platforms, total) VALUES ('Тест', ARRAY['telegram'], 2)`);
await db.exec(`INSERT INTO broadcast_deliveries (broadcast_id, user_id) SELECT 1, id FROM bot_users WHERE ext_id IN ('1','2')`);
await db.exec(`UPDATE broadcast_deliveries SET state = 'sent' WHERE user_id = (SELECT id FROM bot_users WHERE ext_id = '1')`);
const prog = (await q(`SELECT count(*) FILTER (WHERE state = 'sent')::int AS sent, count(*) FILTER (WHERE state = 'pending')::int AS pending FROM broadcast_deliveries WHERE broadcast_id = 1`))[0];
t("доставки: 1 отправлена, 1 в очереди", prog.sent === 1 && prog.pending === 1);

// очистка: неактивные люди и старые счётчики, активные остаются; связанные строки уходят каскадом
await db.exec(`
  INSERT INTO bot_users (platform, ext_id, started, last_seen) VALUES ('max','old', true, now() - interval '13 months');
  INSERT INTO site_hits (day, visitor) VALUES (current_date - 200, 'old'), (current_date - 10, 'fresh');
  INSERT INTO bot_events (user_id, kind, created_at) SELECT id, 'start', now() - interval '200 days' FROM bot_users WHERE ext_id = '1';`);
for (const stmt of PURGE_SQL) await db.exec(stmt);
t("очистка: неактивный человек удалён, активные остались", (await q(`SELECT 1 FROM bot_users WHERE ext_id = 'old'`)).length === 0 && (await q(`SELECT 1 FROM bot_users WHERE ext_id = '1'`)).length === 1);
t("очистка: старые посещения удалены, свежие остались", (await q(`SELECT visitor FROM site_hits WHERE visitor IN ('old','fresh')`)).map((r) => r.visitor).join() === "fresh");
t("очистка: старые события удалены", (await q(`SELECT 1 FROM bot_events WHERE created_at < now() - interval '180 days'`)).length === 0);
if (bad) process.exitCode = 1;
