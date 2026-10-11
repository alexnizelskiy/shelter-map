// node --experimental-strip-types scripts/test-db-url.mjs
import { parseDbConfig } from "../src/lib/db-url.ts";
let bad = 0;
const ok = (name, raw, exp, env) => {
  const r = parseDbConfig(raw, env);
  const pass = r && Object.entries(exp).every(([k, v]) => r[k] === v);
  if (!pass) bad++;
  console.log(pass ? "OK  " : "FAIL", name, pass ? "" : JSON.stringify(r));
};
ok("url", "postgresql://user:pass@host.example:5432/db", { user: "user", password: "pass", host: "host.example", port: 5432, database: "db" });
ok("url special pw", "postgres://gen_user:p@ss#w/rd?x@1.2.3.4:5432/default_db", { user: "gen_user", password: "p@ss#w/rd?x", host: "1.2.3.4", database: "default_db" });
ok("url encoded", "postgresql://u:%40abc%23@h:6543/d?sslmode=require", { password: "@abc#", port: 6543, sslmode: "require" });
ok("url pct", "postgresql://u:pa%ss@h/d", { password: "pa%ss" });
ok("url spaces+quotes", '  "postgresql://u: p w@h:5432/d "  ', { user: "u", password: "pw", host: "h" });
ok("psql prefix", 'psql "postgresql://u:p@h:5432/d?sslmode=require"', { host: "h", sslmode: "require" });
ok("jdbc", "jdbc:postgresql://h:5432/d?user=u&password=p%40", { host: "h", user: "u", password: "p@", database: "d" });
ok("url without userinfo", "postgresql://h:5432/d?user=u&password=pw", { host: "h", user: "u", password: "pw" });
ok("url without db", "postgresql://u:p@h:5432", { host: "h", port: 5432, database: "u" });
ok("export + psql url", 'export PGSSLROOTCERT=$HOME/.cloud-certs/root.crt\npsql "postgresql://gen_user:pa@ss@1.2.3.4:5432/default_db?sslmode=verify-full"', { user: "gen_user", password: "pa@ss", host: "1.2.3.4", database: "default_db", sslmode: "verify-full" });
ok("export PGPASSWORD + psql flags", "export PGPASSWORD='p@ss'\npsql -h h.example -p 5433 -U gen_user -d default_db", { host: "h.example", port: 5433, user: "gen_user", password: "p@ss", database: "default_db" });
ok("inline PGPASSWORD", "PGPASSWORD=x psql -h h -U u -d d", { host: "h", user: "u", password: "x", database: "d" });
ok("dsn", "host=h port=5433 dbname=d user=u password='p w'", { host: "h", port: 5433, database: "d", user: "u", password: "p w" });
ok("block colon", "Host: db.example.com\nPort: 5432\nUser: gen_user\nPassword: s3cr3t!\nDatabase: default_db", { host: "db.example.com", user: "gen_user", password: "s3cr3t!", database: "default_db" });
ok("block env", 'PGHOST="h"\nPGPORT=5432\nPGUSER=u\nPGPASSWORD="p"\nPGDATABASE=d', { host: "h", user: "u", password: "p", database: "d" });
ok("separate env", "", { host: "h", user: "u", database: "d" }, { PGHOST: "h", PGUSER: "u", PGPASSWORD: "p", PGDATABASE: "d" });
for (const g of ["mysql://u:p@h/d", "random text", ""]) {
  const r = parseDbConfig(g);
  console.log(r === null ? "OK  " : "FAIL", "rejects", JSON.stringify(g));
  if (r !== null) bad++;
}
if (bad) process.exitCode = 1;
