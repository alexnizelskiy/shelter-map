// Разбор строки подключения без new URL: пароль может содержать @ # / ? % и не быть закодированным.
export type DbConfig = { host: string; port: number; user: string; password: string; database: string; sslmode?: string };

export function parseDbUrl(raw: string): DbConfig | null {
  const s = raw.trim();
  const m = /^(?:postgres(?:ql)?(?:\+\w+)?):\/\/(.*)$/i.exec(s);
  if (!m) return null;
  let rest = m[1];

  // параметры запроса (?sslmode=...) отделяем только после последнего «/», чтобы «?» в пароле не мешал
  const slash = rest.lastIndexOf("/");
  if (slash < 0) return null;
  const tail = rest.slice(slash + 1);
  const q = tail.indexOf("?");
  const database = decodeSafe(q >= 0 ? tail.slice(0, q) : tail);
  const params = new URLSearchParams(q >= 0 ? tail.slice(q + 1) : "");
  rest = rest.slice(0, slash);

  // учётные данные заканчиваются на последнем «@» перед хостом
  const at = rest.lastIndexOf("@");
  const auth = at >= 0 ? rest.slice(0, at) : "";
  const hostPart = at >= 0 ? rest.slice(at + 1) : rest;
  const colon = auth.indexOf(":");
  const user = decodeSafe(colon >= 0 ? auth.slice(0, colon) : auth);
  const password = decodeSafe(colon >= 0 ? auth.slice(colon + 1) : "");

  const hp = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(hostPart);
  if (!hp || !user || !database) return null;
  return { host: hp[1].replace(/^\[|\]$/g, ""), port: hp[2] ? Number(hp[2]) : 5432, user, password, database, sslmode: params.get("sslmode") ?? undefined };
}

function decodeSafe(v: string) {
  try { return decodeURIComponent(v); } catch { return v; }
}
