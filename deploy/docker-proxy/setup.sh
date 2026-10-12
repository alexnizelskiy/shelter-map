#!/usr/bin/env bash
# Прокси на Vercel в Docker для новых сайтов. Запуск (от root, из этой папки):
#   sudo bash setup.sh EMAIL домен1 [домен2 ...]
# Пример: sudo bash setup.sh me@example.com oporamap.ru kontent.единаясреда.рф
# Домены должны уже указывать (A-запись) на IP этого сервера. Порты 80 и 443 должны быть свободны.
# Повторный запуск безопасен: секрет и выпущенные сертификаты переиспользуются.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo)."; exit 1; }
[ $# -ge 2 ] || { echo "Использование: sudo bash setup.sh EMAIL домен1 [домен2 ...]"; exit 1; }
EMAIL="$1"; shift
DIR="$(cd "$(dirname "$0")" && pwd)"; DATA="$DIR/data"; cd "$DIR"

command -v docker >/dev/null || { echo "Docker не установлен."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нет плагина 'docker compose'."; exit 1; }
command -v python3 >/dev/null || { echo "Нужен python3 (для кириллических доменов)."; exit 1; }

to_ascii() { python3 -c 'import sys; print(sys.argv[1].strip().lower().encode("idna").decode())' "$1"; }

# Порты 80/443 должны быть свободны (или заняты нашим же контейнером)
for p in 80 443; do
  if ss -ltn "sport = :$p" | grep -q LISTEN && ! docker ps --format '{{.Names}}' | grep -qx vercel-proxy; then
    echo "Порт $p уже занят другим сервисом. Освободите его или выберите другую схему."; ss -ltnp "sport = :$p"; exit 1
  fi
done

mkdir -p "$DATA/conf.d" "$DATA/www" "$DATA/letsencrypt"
cp nginx/00-common.conf "$DATA/conf.d/00-common.conf"

# Общий секрет (его же нужно указать в Vercel как PROXY_SECRET); значение в чат и репозиторий не отправлять
umask 077
[ -s "$DATA/proxy.secret" ] || openssl rand -hex 32 > "$DATA/proxy.secret"
SECRET="$(tr -d '\n' < "$DATA/proxy.secret")"
sed "s|__PROXY_SECRET__|$SECRET|" nginx/proxy-common.inc > "$DATA/proxy-common.inc"
umask 022

MYIP="$(curl -s --max-time 8 https://api.ipify.org || true)"
DOMAINS=(); NAMES_OF=()
for raw in "$@"; do
  d="$(to_ascii "$raw")"
  names="$d"
  # www добавляем только к корневым доменам (из двух частей: oporamap.ru)
  [ "$(awk -F. '{print NF}' <<<"$d")" = 2 ] && names="$d www.$d"
  DOMAINS+=("$d"); NAMES_OF+=("$names")
  for n in $names; do
    got="$(getent ahostsv4 "$n" | awk '{print $1; exit}' || true)"
    [ -n "$MYIP" ] && [ "$got" != "$MYIP" ] && echo "ВНИМАНИЕ: $n указывает на '${got:-ничего}', а IP этого сервера $MYIP. Выпуск сертификата может не пройти."
  done
done

# 1) временные http-конфиги для выпуска сертификатов
for i in "${!DOMAINS[@]}"; do
  d="${DOMAINS[$i]}"
  if [ ! -d "$DATA/letsencrypt/live/$d" ]; then
    sed "s|__NAMES__|${NAMES_OF[$i]}|g" nginx/http.conf.tpl > "$DATA/conf.d/$d.conf"
  fi
done
docker compose up -d
sleep 2

# 2) сертификаты
for i in "${!DOMAINS[@]}"; do
  d="${DOMAINS[$i]}"; args=()
  for n in ${NAMES_OF[$i]}; do args+=(-d "$n"); done
  docker run --rm -v "$DATA/letsencrypt:/etc/letsencrypt" -v "$DATA/www:/var/www/certbot" certbot/certbot \
    certonly --webroot -w /var/www/certbot --cert-name "$d" "${args[@]}" \
    -m "$EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring
done

# 3) боевые конфиги
for i in "${!DOMAINS[@]}"; do
  d="${DOMAINS[$i]}"
  sed -e "s|__NAMES__|${NAMES_OF[$i]}|g" -e "s|__DOMAIN__|$d|g" nginx/https.conf.tpl > "$DATA/conf.d/$d.conf"
done
if docker compose exec -T nginx nginx -t; then
  docker compose exec -T nginx nginx -s reload
else
  echo "Ошибка в конфиге nginx, перезагрузка не выполнена."; exit 1
fi

# 4) автопродление сертификатов
cat > /etc/cron.d/vercel-proxy-renew <<CRON
17 3 * * * root docker run --rm -v $DATA/letsencrypt:/etc/letsencrypt -v $DATA/www:/var/www/certbot certbot/certbot renew -q && docker exec vercel-proxy nginx -s reload
CRON

echo
echo "Готово. Домены: ${DOMAINS[*]}"
echo "PROXY_SECRET лежит в файле: $DATA/proxy.secret (скопируйте значение в Vercel, проект «Опора», и сделайте Redeploy):"
echo "  cat $DATA/proxy.secret"
echo "Проверка: curl -sI https://${DOMAINS[0]}/ | head -3"
