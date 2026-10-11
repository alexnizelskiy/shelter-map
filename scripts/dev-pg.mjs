// Локальная замена Postgres для разработки: node scripts/dev-pg.mjs  -> postgres://postgres@127.0.0.1:5433/postgres
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log("pglite on 5433");
