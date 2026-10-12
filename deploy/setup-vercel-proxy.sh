#!/usr/bin/env bash
# Добавляет домены в nginx-прокси на Vercel. Запускать на сервере с nginx от root.
#   sudo bash setup-vercel-proxy.sh example.ru other.ru           # настроить прокси (HTTP) для доменов
#   sudo bash setup-vercel-proxy.sh cert you@mail.ru example.ru other.ru   # выпустить HTTPS-сертификаты (после смены DNS)
# Работающие сайты не затрагиваются: добавляются отдельные файлы, конфиг проверяется до перезагрузки, при ошибке всё откатывается.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${HERE}/nginx/vercel-proxy.conf"
NEW_SECRET_FILE="/etc/nginx/vercel-proxy.secret"
OLD_SECRET_FILE="/etc/nginx/opora-proxy.secret"   # совместимость с прежней версией скрипта

[ "$(id -u)" -eq 0 ] || { echo "Запустите от root: sudo bash $0 $*"; exit 1; }
command -v nginx >/dev/null || { echo "nginx не найден на этом сервере"; exit 1; }

valid_domain() { [[ "$1" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z0-9-]{2,}$ ]]; }
# кириллические домены (kontent.единаясреда.рф) переводим в punycode, nginx и certbot работают с ним
to_ascii() { python3 -c 'import sys; print(sys.argv[1].strip().lower().encode("idna").decode())' "$1"; }
# www нужен только корневому домену (одна точка: example.ru), поддомену (a.example.ru) он не нужен
is_apex() { [ "$(tr -cd '.' <<<"$1" | wc -c)" -eq 1 ]; }

# ── режим cert ──
if [ "${1:-}" = "cert" ]; then
  EMAIL="${2:-}"; shift 2 || true
  [ -n "$EMAIL" ] && [ $# -ge 1 ] || { echo "Использование: sudo bash $0 cert you@mail.ru domain1 [domain2 ...]"; exit 1; }
  command -v certbot >/dev/null || { apt-get update -y && apt-get install -y certbot python3-certbot-nginx; }
  for raw in "$@"; do
    d="$(to_ascii "$raw")"
    valid_domain "$d" || { echo "Некорректный домен: $raw"; exit 1; }
    ARGS=(-d "$d"); is_apex "$d" && ARGS+=(-d "www.$d")
    certbot --nginx "${ARGS[@]}" --redirect -m "$EMAIL" --agree-tos --no-eff-email --non-interactive
  done
  nginx -t && systemctl reload nginx
  for raw in "$@"; do echo "Проверьте: curl -I https://$(to_ascii "$raw")/"; done
  exit 0
fi

[ $# -ge 1 ] || { echo "Укажите домены: sudo bash $0 example.ru [other.ru ...]"; exit 1; }
[ -f "$TEMPLATE" ] || { echo "Не найден шаблон $TEMPLATE (папка nginx должна лежать рядом со скриптом)"; exit 1; }
DOMAINS=()
for raw in "$@"; do
  d="$(to_ascii "$raw")"
  valid_domain "$d" || { echo "Некорректный домен: $raw"; exit 1; }
  [[ "$d" == www.* ]] && { echo "Укажите домен без www: $raw"; exit 1; }
  DOMAINS+=("$d")
done

# общий секрет подписи заголовка с IP посетителя; при повторном запуске переиспользуется
if [ -s "$NEW_SECRET_FILE" ]; then SECRET="$(cat "$NEW_SECRET_FILE")"
elif [ -s "$OLD_SECRET_FILE" ]; then SECRET="$(cat "$OLD_SECRET_FILE")"
else SECRET="${PROXY_SECRET:-$(openssl rand -hex 24)}"; fi
( umask 077; printf '%s' "$SECRET" > "$NEW_SECRET_FILE" )

CREATED=()
for d in "${DOMAINS[@]}"; do
  AVAIL="/etc/nginx/sites-available/vercel-proxy-$d"
  ENABLED="/etc/nginx/sites-enabled/vercel-proxy-$d"
  [ -f "$AVAIL" ] && cp "$AVAIL" "${AVAIL}.bak.$(date +%Y%m%d%H%M%S)"
  if is_apex "$d"; then CONTENT="$(cat "$TEMPLATE")"; else CONTENT="$(sed '/# WWW-BEGIN/,/# WWW-END/d' "$TEMPLATE")"; fi
  printf '%s\n' "$CONTENT" | sed -e "s/__DOMAIN__/$d/g" -e "s/__PROXY_SECRET__/$SECRET/" > "$AVAIL"
  ln -sfn "$AVAIL" "$ENABLED"; CREATED+=("$ENABLED")
done

# проверяем весь конфиг; при ошибке убираем только что добавленное и ничего не перезагружаем
if ! nginx -t; then
  echo "Ошибка в конфигурации nginx, откатываю изменения."
  rm -f "${CREATED[@]}"
  exit 1
fi
systemctl reload nginx

echo; echo "── Проверка: запрос на этот сервер с именем сайта (ожидается 200/30x от приложения) ──"
for d in "${DOMAINS[@]}"; do printf "%-45s" "$d"; curl -sS -o /dev/null -m 20 -w "HTTP %{http_code}\n" -H "Host: $d" http://127.0.0.1/ || echo "нет ответа"; done
echo
echo "PROXY_SECRET для Vercel (Settings → Environment Variables), один и тот же для всех доменов:"
echo "  $SECRET"
echo
echo "Дальше: 1) в DNS у регистратора указать A-запись каждого домена на IP этого сервера,"
echo "2) подождать обновления DNS, 3) sudo bash $0 cert you@mail.ru $*"
