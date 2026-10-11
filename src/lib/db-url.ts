// Разбор подключения к Postgres. Понимает: postgresql://user:pass@host:port/db (пароль может содержать @ # / ? %),
// jdbc:postgresql://host:port/db?user=..&password=.., libpq-DSN «host=.. port=.. dbname=.. user=.. password=..»,
// а также блок строк «host: ..», «user: ..», «PGHOST=..» (то, что копируют из панели хостинга).
export type DbConfig = { host: string; port: number; user: string; password: string; database: string; sslmode?: string };

const decodeSafe = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };
const unquote = (v: string) => v.trim().replace(/^["'`“”«]+|["'`“”»;,]+$/g, "").trim();

const KEYS: Record<string, keyof DbConfig> = {
  host: "host", hostname: "host", server: "host", addr: "host", pghost: "host",
  port: "port", pgport: "port",
  user: "user", username: "user", login: "user", pguser: "user",
  password: "password", pass: "password", pwd: "password", pgpassword: "password",
  dbname: "database", database: "database", db: "database", pgdatabase: "database",
  sslmode: "sslmode",
};

function fromPairs(pairs: Record<string, string>): DbConfig | null {
  const c: Partial<Record<keyof DbConfig, string>> = {};
  for (const [k, v] of Object.entries(pairs)) { const key = KEYS[k.toLowerCase()]; if (key && v && !c[key]) c[key] = v; }
  if (!c.host || !c.user) return null;
  // как в libpq: без имени базы используется имя пользователя
  return { host: c.host, port: Number(c.port) || 5432, user: c.user, password: c.password ?? "", database: c.database || c.user, sslmode: c.sslmode };
}

function parseUrlForm(raw: string): DbConfig | null {
  const s = raw.replace(/^\s*psql\s+/i, "").replace(/^jdbc:/i, "").replace(/\s+/g, "");
  const m = /^["'`]?postgres(?:ql)?(?:\+\w+)?:\/\/(.*?)["'`]?$/i.exec(s);
  if (!m) return null;
  let rest = m[1];

  const slash = rest.lastIndexOf("/");
  const tail = slash >= 0 ? rest.slice(slash + 1) : "";
  // параметры запроса бывают и без «/база» (host:port?user=..), поэтому ищем «?» только в хвосте после последнего «/»
  const qIdx = slash >= 0 ? tail.indexOf("?") : -1;
  const database = decodeSafe(slash >= 0 ? (qIdx >= 0 ? tail.slice(0, qIdx) : tail) : "");
  const params = new URLSearchParams(slash >= 0 && qIdx >= 0 ? tail.slice(qIdx + 1) : "");
  if (slash >= 0) rest = rest.slice(0, slash);

  const at = rest.lastIndexOf("@");
  const auth = at >= 0 ? rest.slice(0, at) : "";
  const hostPart = at >= 0 ? rest.slice(at + 1) : rest;
  const colon = auth.indexOf(":");
  const user = decodeSafe(colon >= 0 ? auth.slice(0, colon) : auth) || params.get("user") || "";
  const password = colon >= 0 ? decodeSafe(auth.slice(colon + 1)) : params.get("password") ?? "";

  const hp = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(hostPart);
  const db = database || params.get("dbname") || params.get("database") || user;
  if (!hp || !user) return null;
  return { host: hp[1].replace(/^\[|\]$/g, ""), port: hp[2] ? Number(hp[2]) : 5432, user, password, database: db, sslmode: params.get("sslmode") ?? undefined };
}

function parsePairs(raw: string): DbConfig | null {
  const pairs: Record<string, string> = {};
  const re = /([A-Za-z_]+)\s*[=:]\s*(?:'([^']*)'|"([^"]*)"|([^\s,;]+))/g;
  for (let m: RegExpExecArray | null; (m = re.exec(raw)); ) pairs[m[1]] = unquote(m[2] ?? m[3] ?? m[4] ?? "");
  return fromPairs(pairs);
}

// Флаги psql: -h хост -p порт -U пользователь -d база (и длинные --host=…); пароль обычно в PGPASSWORD=…
function parsePsqlFlags(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:^|\s)(-h|--host|-p|--port|-U|--username|-d|--dbname)(?:=|\s+)(?:'([^']*)'|"([^"]*)"|(\S+))/g;
  const map: Record<string, string> = { "-h": "host", "--host": "host", "-p": "port", "--port": "port", "-U": "user", "--username": "user", "-d": "database", "--dbname": "database" };
  for (let m: RegExpExecArray | null; (m = re.exec(raw)); ) out[map[m[1]]] = unquote(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

export function parseDbConfig(raw: string, env: Record<string, string | undefined> = {}): DbConfig | null {
  const text = raw.trim();
  if (text) {
    // команда вроде «export PGSSLROOTCERT=…\npsql "postgresql://…"»: берём саму ссылку из любого места
    const urlInText = /postgres(?:ql)?(?:\+\w+)?:\/\/[^\s"'`]+/i.exec(text.replace(/^\s*psql\s+/i, ""))?.[0];
    // если вся строка — это ссылка (возможно, с лишними пробелами внутри), разбираем её целиком
    const wholeIsUrl = /^["'`]?(?:psql\s+)?(?:jdbc:)?postgres(?:ql)?(?:\+\w+)?:\/\//i.test(text);
    const viaUrl = (wholeIsUrl ? parseUrlForm(text) : null) ?? (urlInText ? parseUrlForm(urlInText) : null);
    if (viaUrl) return viaUrl;
    const viaPairs = parsePairs(text);
    const flags = parsePsqlFlags(text);
    const merged = fromPairs({ ...(viaPairs ? { host: viaPairs.host, port: String(viaPairs.port), user: viaPairs.user, password: viaPairs.password, database: viaPairs.database } : {}), ...flags, ...pickPassword(text) });
    if (merged) return merged;
  }
  // отдельные переменные PGHOST / PGUSER / ...
  return fromPairs({ host: env.PGHOST ?? "", port: env.PGPORT ?? "", user: env.PGUSER ?? "", password: env.PGPASSWORD ?? "", database: env.PGDATABASE ?? "" });
}

// PGPASSWORD=… из строк «export PGPASSWORD=…» / «PGPASSWORD=… psql …»
function pickPassword(raw: string): Record<string, string> {
  const m = /PGPASSWORD\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s;]+))/.exec(raw);
  return m ? { password: unquote(m[1] ?? m[2] ?? m[3] ?? "") } : {};
}

export const parseDbUrl = parseDbConfig;

// Безопасное описание «формы» строки для диагностики: без хоста, логина и пароля.
export function describeDbRaw(raw: string) {
  const t = raw.trim();
  const scheme = /^["'`]?(?:psql\s+)?(jdbc:)?(postgres(?:ql)?)(?:\+\w+)?:\/\//i.test(t) ? "url" : /[=:]/.test(t) ? "pairs" : t ? "other" : "empty";
  return {
    format: scheme,
    length: t.length,
    lines: t ? t.split(/\r?\n/).length : 0,
    hasAt: t.includes("@"),
    hasSpaces: /\s/.test(t),
    quoted: /^["'`“”«]|["'`“”»]$/.test(t),
    startsWith: /^[A-Za-z+:]{0,16}/.exec(t.replace(/^["'`“”«\s]+/, ""))?.[0] ?? "",
  };
}
