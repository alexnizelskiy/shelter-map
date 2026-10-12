// Запросы статистики админки (по московскому времени). Вынесены в отдельный файл, чтобы их прогонял автотест на встроенной базе.
export const D = "(now() AT TIME ZONE 'Europe/Moscow')::date";
export const MSK = (col: string) => `(${col} AT TIME ZONE 'Europe/Moscow')::date`;

export const STATS_SQL = {
  today: `
    SELECT
      (SELECT count(*) FROM site_hits WHERE day = ${D})::int AS web,
      (SELECT count(*) FROM bot_activity a JOIN bot_users u ON u.id = a.user_id WHERE a.day = ${D} AND u.platform = 'telegram')::int AS tg_active,
      (SELECT count(*) FROM bot_activity a JOIN bot_users u ON u.id = a.user_id WHERE a.day = ${D} AND u.platform = 'max')::int AS max_active,
      (SELECT count(*) FROM bot_users WHERE ${MSK("first_seen")} = ${D} AND platform = 'telegram')::int AS tg_new,
      (SELECT count(*) FROM bot_users WHERE ${MSK("first_seen")} = ${D} AND platform = 'max')::int AS max_new,
      (SELECT count(*) FROM chat_users WHERE ${MSK("created_at")} = ${D})::int AS chat_new,
      (SELECT count(*) FROM suggestions WHERE ${MSK("created_at")} = ${D})::int AS suggestions,
      (SELECT count(*) FROM shelter_photos WHERE ${MSK("created_at")} = ${D})::int AS photos,
      (SELECT count(*) FROM shelter_reports WHERE ${MSK("created_at")} = ${D})::int AS reports`,
  series: `
    SELECT to_char(g.d::date, 'DD.MM') AS day,
      (SELECT count(*) FROM site_hits h WHERE h.day = g.d::date)::int AS web,
      (SELECT count(*) FROM bot_activity a WHERE a.day = g.d::date)::int AS bot,
      (SELECT count(*) FROM bot_users u WHERE ${MSK("u.first_seen")} = g.d::date)::int AS new_bot,
      (SELECT count(*) FROM chat_users c WHERE ${MSK("c.created_at")} = g.d::date)::int AS new_chat
    FROM generate_series(${D} - 13, ${D}, interval '1 day') AS g(d) ORDER BY g.d DESC`,
  webBySource: `SELECT source, count(*)::int AS n FROM site_hits WHERE day >= ${D} - 29 GROUP BY source`,
  startsBySource: `SELECT source, count(*)::int AS n, count(DISTINCT user_id)::int AS people FROM bot_events WHERE kind = 'start' AND created_at > now() - interval '30 days' GROUP BY source`,
  firstBySource: `SELECT source, count(*)::int AS n FROM bot_users WHERE first_seen > now() - interval '30 days' GROUP BY source`,
  chatBySource: `SELECT source, count(*)::int AS n FROM chat_users WHERE created_at > now() - interval '30 days' GROUP BY source`,
  platforms: `
    SELECT platform, count(*)::int AS total, count(*) FILTER (WHERE started)::int AS started,
      count(*) FILTER (WHERE started AND notify AND NOT blocked)::int AS reachable, count(*) FILTER (WHERE blocked)::int AS blocked,
      count(*) FILTER (WHERE subscribed)::int AS subscribed, count(*) FILTER (WHERE subscribed = false)::int AS not_subscribed,
      count(*) FILTER (WHERE NOT started)::int AS only_app
    FROM bot_users GROUP BY platform ORDER BY platform`,
  channels: `SELECT channel, count(*)::int AS n FROM site_hits WHERE day = ${D} GROUP BY channel ORDER BY n DESC`,
  cities: `SELECT city, count(*)::int AS n FROM site_hits WHERE day >= ${D} - 6 AND city <> '' GROUP BY city ORDER BY n DESC LIMIT 10`,
  chatProviders: `SELECT provider, count(*)::int AS n FROM chat_users GROUP BY provider ORDER BY n DESC`,
  retention: `
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM bot_activity a WHERE a.user_id = u.id AND a.day > ${MSK("u.first_seen")}))::int AS returned
    FROM bot_users u WHERE u.first_seen < now() - interval '2 days'`,
};
