#!/usr/bin/env bash
# Добавляет oporamap.ru в nginx-прокси на сервере. Запускать на сервере с nginx от root:
#   sudo bash setup-oporamap-proxy.sh            # настроить прокси (HTTP) и вывести следующие шаги
#   sudo bash setup-oporamap-proxy.sh cert you@example.ru   # выпустить HTTPS-сертификат (после переключения DNS)
# Существующие сайты не затрагиваются: добавляется только отдельный файл, конфиг проверяется до перезагрузки.
set -euo pipefail

DOMAIN="oporamap.ru"
CONF_NAME="oporamap.ru"
AVAIL="/etc/nginx/sites-available/${CONF_NAME}"
ENABLED="/etc/nginx/sites-enabled/${CONF_NAME}"
SECRET_FILE="/etc/nginx/opora-proxy.secret"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${HERE}/nginx/oporamap.ru.conf"

need_root() { [ "$(id -u)" -eq 0 ] || { echo "Запустите от root: sudo bash $0 $*"; exit 1; }; }
need_root "$@"
command -v nginx >/dev/null || { echo "nginx не найден на этом сервере"; exit 1; }

if [ "${1:-}" = "cert" ]; then
  EMAIL="${2:-}"; [ -n "$EMAIL" ] || { echo "Укажите почту: sudo bash $0 cert you@example.ru"; exit 1; }
  command -v certbot >/dev/null || { apt-get update -y && apt-get install -y certbot python3-certbot-nginx; }
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --redirect -m "$EMAIL" --agree-tos --no-eff-email --non-interactive
  nginx -t && systemctl reload nginx
  echo "Готово. Проверьте: curl -I https://${DOMAIN}/"
  exit 0
fi

[ -f "$TEMPLATE" ] || { echo "Не найден шаблон $TEMPLATE (положите папку nginx рядом со скриптом)"; exit 1; }

# секрет переиспользуется при повторном запуске
if [ -s "$SECRET_FILE" ]; then SECRET="$(cat "$SECRET_FILE")"
else SECRET="${PROXY_SECRET:-$(openssl rand -hex 24)}"; umask 077; printf '%s' "$SECRET" > "$SECRET_FILE"; fi

# резервная копия прежнего конфига этого сайта (если был)
[ -f "$AVAIL" ] && cp "$AVAIL" "${AVAIL}.bak.$(date +%Y%m%d%H%M%S)"

sed "s/__PROXY_SECRET__/${SECRET}/" "$TEMPLATE" > "$AVAIL"
ln -sfn "$AVAIL" "$ENABLED"

# проверяем весь конфиг; если ошибка — откатываемся и ничего не перезагружаем
if ! nginx -t; then
  echo "Ошибка в конфигурации nginx, откатываю изменения."
  rm -f "$ENABLED"
  exit 1
fi
systemctl reload nginx

echo
echo "── Проверка прокси (запрос идёт на этот сервер с именем сайта) ──"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -H "Host: ${DOMAIN}" http://127.0.0.1/ || true
echo
echo "PROXY_SECRET для Vercel (Settings → Environment Variables):"
echo "  ${SECRET}"
echo
echo "Дальше: 1) в DNS у Timeweb указать A-запись ${DOMAIN} на IP этого сервера, 2) подождать обновления DNS,"
echo "3) sudo bash $0 cert you@example.ru   — выпустить HTTPS-сертификат."
