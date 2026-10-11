// node --experimental-strip-types scripts/test-db-url.mjs
import { parseDbUrl } from "../src/lib/db-url.ts";
const ok = (raw, exp) => {
  const r = parseDbUrl(raw);
  const pass = r && Object.entries(exp).every(([k, v]) => r[k] === v);
  console.log(pass ? "OK  " : "FAIL", raw, "->", JSON.stringify(r));
  if (!pass) process.exitCode = 1;
};
ok("postgresql://user:pass@host.example:5432/db", { user: "user", password: "pass", host: "host.example", port: 5432, database: "db" });
ok("postgres://gen_user:p@ss#w/rd?x@1.2.3.4:5432/default_db", { user: "gen_user", password: "p@ss#w/rd?x", host: "1.2.3.4", database: "default_db" });
ok("postgresql://u:%40abc%23@h:6543/d?sslmode=require", { password: "@abc#", port: 6543, sslmode: "require" });
ok("postgresql://u:pa%ss@h/d", { password: "pa%ss", port: 5432 });
ok("postgresql+psycopg2://u:p@h:1/d", { host: "h", port: 1 });
console.log(parseDbUrl("mysql://u:p@h/d") === null ? "OK   non-postgres rejected" : "FAIL");
console.log(parseDbUrl("postgresql://hostonly") === null ? "OK   garbage rejected" : "FAIL");
