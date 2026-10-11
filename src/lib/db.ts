import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;
let ready: Promise<void> | null = null;

export const dbConfigured = () => Boolean(process.env.DATABASE_URL);

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS shelter_reports (
  id         BIGSERIAL PRIMARY KEY,
  shelter_id TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('open','closed','not_found','wrong_info')),
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shelter_reports_shelter_idx ON shelter_reports (shelter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shelter_reports_ip_idx ON shelter_reports (ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS suggestions (
  id          BIGSERIAL PRIMARY KEY,
  city_slug   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  address     TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  basis       TEXT NOT NULL,
  source_url  TEXT,
  comment     TEXT,
  state       TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','approved','rejected','need_info')),
  ip_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suggestions_state_idx ON suggestions (state, created_at DESC);
CREATE INDEX IF NOT EXISTS suggestions_ip_idx ON suggestions (ip_hash, created_at DESC);
`;

// Сводка по каждой точке за окно TTL. $1 — часы TTL, $2 — часы окна «проблем», $3 — id точек города.
export const SUMMARY_SQL = `
SELECT shelter_id AS "shelterId",
  count(*) FILTER (WHERE kind='open')::int       AS open,
  count(*) FILTER (WHERE kind='closed')::int     AS closed,
  count(*) FILTER (WHERE kind='not_found')::int  AS not_found,
  count(*) FILTER (WHERE kind='wrong_info')::int AS wrong_info,
  count(DISTINCT ip_hash) FILTER (
    WHERE kind IN ('closed','not_found') AND created_at > now() - make_interval(hours => $2::int)
  )::int AS "problems6h",
  (array_agg(kind ORDER BY created_at DESC))[1] AS "lastKind",
  to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastAt"
FROM shelter_reports
WHERE created_at > now() - make_interval(hours => $1::int) AND shelter_id = ANY($3::text[])
GROUP BY shelter_id`;

// Не чаще одной отметки одного вида по одной точке с одного адреса за 6 часов и не более 20 отметок в час.
export const REPORT_LIMIT_SQL = `
SELECT
  count(*) FILTER (WHERE shelter_id = $2 AND kind = $3 AND created_at > now() - interval '6 hours')::int AS same,
  count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour
FROM shelter_reports WHERE ip_hash = $1`;

export const SUGGEST_LIMIT_SQL = `
SELECT count(*)::int AS n FROM suggestions WHERE ip_hash = $1 AND created_at > now() - interval '24 hours'`;

export function sql() {
  if (!client) {
    client = postgres(process.env.DATABASE_URL!, {
      ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
      max: 3,
      idle_timeout: 20,
      prepare: false, // совместимо с пулерами соединений
    });
  }
  return client;
}

export function ensureSchema() {
  ready ??= sql().unsafe(SCHEMA).then(() => undefined).catch((e) => { ready = null; throw e; });
  return ready;
}
