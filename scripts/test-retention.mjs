// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-retention.mjs
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA } from "../src/lib/db.ts";
import { PURGE_SQL } from "../src/lib/maintenance.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

const db = new PGlite();
await db.exec(SCHEMA);
const ago = (d) => `now() - interval '${d} days'`;

await db.exec(`INSERT INTO shelter_reports (shelter_id, kind, ip_hash, created_at) VALUES ('a','closed','x',${ago(120)}), ('a','open','y',${ago(1)})`);
await db.exec(`INSERT INTO suggestions (city_slug,kind,address,lat,lng,basis,ip_hash,state,created_at) VALUES
  ('c','unknown','old-rejected',1,1,'unknown','h','rejected',${ago(200)}),
  ('c','unknown','recent-rejected',1,1,'unknown','h','rejected',${ago(10)}),
  ('c','unknown','old-approved',1,1,'unknown','h','approved',${ago(200)}),
  ('c','unknown','fresh',1,1,'unknown','h','new',${ago(1)})`);
await db.exec(`INSERT INTO chat_users (provider, ext_id, first_name, last_seen) VALUES ('dev','inactive','A', now() - interval '13 months'), ('dev','active','B', now()), ('dev','banned-inactive','C', now() - interval '13 months')`);
await db.exec(`UPDATE chat_users SET banned_until = now() + interval '30 days' WHERE ext_id = 'banned-inactive'`);
await db.exec(`INSERT INTO data_requests (kind, contact, state, closed_at) VALUES ('other','a@b','done', now() - interval '13 months'), ('other','c@d','done', now() - interval '1 month'), ('other','e@f','new', NULL)`);
await db.exec(`INSERT INTO shelter_photos (city_slug, shelter_id, mime, size, state, ip_hash, created_at, reviewed_at) VALUES ('c','a','image/jpeg',1,'rejected','z',${ago(30)},${ago(10)}), ('c','a','image/jpeg',1,'approved','z',${ago(120)},${ago(120)})`);
await db.exec(`INSERT INTO admin_attempts (ip_hash, created_at) VALUES ('a', ${ago(10)}), ('b', ${ago(1)})`);

for (const stmt of PURGE_SQL) await db.exec(stmt);
const q = async (sql) => (await db.query(sql)).rows;

t("отметки старше 90 дней удалены, свежие остались", (await q("SELECT kind FROM shelter_reports")).map((r) => r.kind).join() === "open");
t("старая отклонённая заявка удалена", (await q("SELECT address FROM suggestions WHERE address='old-rejected'")).length === 0);
t("свежая отклонённая остаётся", (await q("SELECT address FROM suggestions WHERE address='recent-rejected'")).length === 1);
t("одобренная остаётся, но хэш IP стёрт", (await q("SELECT ip_hash FROM suggestions WHERE address='old-approved'"))[0]?.ip_hash === "");
t("свежая заявка сохранила хэш IP", (await q("SELECT ip_hash FROM suggestions WHERE address='fresh'"))[0]?.ip_hash === "h");
t("неактивный профиль удалён", (await q("SELECT 1 FROM chat_users WHERE ext_id='inactive'")).length === 0);
t("активный и заблокированный остались", (await q("SELECT ext_id FROM chat_users ORDER BY ext_id")).map((r) => r.ext_id).join() === "active,banned-inactive");
t("обработанный запрос старше года удалён, остальные остались", (await q("SELECT contact FROM data_requests ORDER BY contact")).map((r) => r.contact).join() === "c@d,e@f");
t("отклонённое фото удалено, одобренное осталось", (await q("SELECT state FROM shelter_photos")).map((r) => r.state).join() === "approved");
t("у одобренного фото хэш IP стёрт", (await q("SELECT ip_hash FROM shelter_photos"))[0]?.ip_hash === "");
t("журнал входа админа старше 7 дней удалён", (await q("SELECT ip_hash FROM admin_attempts")).map((r) => r.ip_hash).join() === "b");
if (bad) process.exitCode = 1;
