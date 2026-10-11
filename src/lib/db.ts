import postgres from "postgres";
import { cleanEnv } from "./env";

const dbUrl = () => cleanEnv(process.env.DATABASE_URL, "DATABASE_URL", true);

// Клиент и промис схемы хранятся в globalThis: в dev-режиме модули пересоздаются на каждый маршрут, а пул должен быть один.
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres>; __pgReady?: Promise<void> | null };

export const dbConfigured = () => Boolean(dbUrl());

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
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS moderator_note TEXT;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Точки, добавленные модератором из заявок жителей (никогда не «официальные»).
CREATE TABLE IF NOT EXISTS published_shelters (
  id            BIGSERIAL PRIMARY KEY,
  city_slug     TEXT NOT NULL,
  kind          TEXT NOT NULL,
  address       TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  note          TEXT,
  source_url    TEXT,
  suggestion_id BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE published_shelters DROP CONSTRAINT IF EXISTS published_shelters_kind_check;
ALTER TABLE published_shelters ADD COLUMN IF NOT EXISTS object_type TEXT;
ALTER TABLE published_shelters ADD COLUMN IF NOT EXISTS placement TEXT;
ALTER TABLE published_shelters ADD COLUMN IF NOT EXISTS holder TEXT;
ALTER TABLE published_shelters ADD COLUMN IF NOT EXISTS capacity INT;
ALTER TABLE published_shelters ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'community';

-- Города, добавленные из админки (статические города лежат в коде).
CREATE TABLE IF NOT EXISTS cities (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  center_lng   DOUBLE PRECISION NOT NULL,
  center_lat   DOUBLE PRECISION NOT NULL,
  zoom         INT NOT NULL DEFAULT 11,
  min_lng      DOUBLE PRECISION NOT NULL,
  min_lat      DOUBLE PRECISION NOT NULL,
  max_lng      DOUBLE PRECISION NOT NULL,
  max_lat      DOUBLE PRECISION NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Скрытие любой точки до проверки.
CREATE TABLE IF NOT EXISTS shelter_overrides (
  shelter_id TEXT PRIMARY KEY,
  hidden     BOOLEAN NOT NULL DEFAULT false,
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Фото укрытий от жителей: хранятся в базе (сжатые на устройстве), показываются только после проверки модератором.
CREATE TABLE IF NOT EXISTS shelter_photos (
  id          BIGSERIAL PRIMARY KEY,
  city_slug   TEXT NOT NULL,
  shelter_id  TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INT NOT NULL,
  data        BYTEA,
  state       TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','approved','rejected')),
  ip_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS shelter_photos_idx ON shelter_photos (shelter_id, state);
CREATE INDEX IF NOT EXISTS shelter_photos_ip_idx ON shelter_photos (ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_attempts (
  id         BIGSERIAL PRIMARY KEY,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_attempts_idx ON admin_attempts (ip_hash, created_at DESC);
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
  if (!g.__pg) {
    g.__pg = postgres(dbUrl(), {
      ssl: cleanEnv(process.env.DATABASE_SSL) === "disable" ? false : "require",
      max: Number(cleanEnv(process.env.DATABASE_POOL)) || 3,
      idle_timeout: 20,
      prepare: false, // совместимо с пулерами соединений
    });
  }
  return g.__pg;
}

export function ensureSchema() {
  g.__pgReady ??= sql().unsafe(SCHEMA).then(() => undefined).catch((e) => { g.__pgReady = null; throw e; });
  return g.__pgReady;
}
