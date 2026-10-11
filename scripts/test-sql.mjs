// Прогон SQL из src/lib/db.ts на PGlite: node --experimental-strip-types scripts/test-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA, SUMMARY_SQL, REPORT_LIMIT_SQL, SUGGEST_LIMIT_SQL } from "../src/lib/db.ts";

const db = new PGlite();
await db.exec(SCHEMA);
const ins = (id, kind, ip, ago = "0 minutes") =>
  db.query(`INSERT INTO shelter_reports (shelter_id, kind, ip_hash, created_at) VALUES ($1,$2,$3, now() - $4::interval)`, [id, kind, ip, ago]);
await ins("rnd-0001", "closed", "a");
await ins("rnd-0001", "not_found", "b", "1 hour");
await ins("rnd-0001", "closed", "a", "2 hours"); // тот же адрес — считается как один
await ins("rnd-0001", "closed", "c", "10 hours"); // вне окна 6ч
await ins("rnd-0001", "open", "d", "30 hours"); // вне TTL
await ins("rnd-0002", "open", "e", "5 minutes");

const { rows } = await db.query(SUMMARY_SQL, [24, 6, ["rnd-0001", "rnd-0002", "rnd-0003"]]);
console.log(rows);
const r1 = rows.find((r) => r.shelterId === "rnd-0001");
console.assert(r1.closed === 3 && r1.not_found === 1 && r1.open === 0, "counts");
console.assert(r1.problems6h === 2, "distinct problems in 6h = 2, got " + r1.problems6h);
console.assert(r1.lastKind === "closed" && /Z$/.test(r1.lastAt), "last");
console.assert(!rows.find((r) => r.shelterId === "rnd-0003"), "no reports -> no row");

const l = await db.query(REPORT_LIMIT_SQL, ["a", "rnd-0001", "closed"]);
console.log(l.rows);
console.assert(l.rows[0].same === 2 && l.rows[0].hour === 1, "limit counts");
await db.query(`INSERT INTO suggestions (city_slug,kind,address,lat,lng,basis,ip_hash) VALUES ('rostov-na-donu','unknown','ул. Тест, 1',47.2,39.7,'unknown','z')`);
console.log((await db.query(SUGGEST_LIMIT_SQL, ["z"])).rows);
console.log("SQL OK");
