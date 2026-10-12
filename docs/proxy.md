# Домены через собственный nginx-прокси (обход блокировки Vercel)

Зачем: часть российских провайдеров не открывает Vercel без VPN. Прокси на российском сервере принимает запросы и пересылает их на Vercel.
Схема: посетитель → nginx на сервере (HTTPS, Let's Encrypt) → Vercel.

Домены: `oporamap.ru` (+ `www`) и `kontent.единаясреда.рф`. Скрипт принимает любой список доменов, кириллицу переводит в punycode сам (`kontent.xn--80aakbcct4b2aj7m.xn--p1ai`), `www` создаёт только для корневых доменов.

## Порядок (работающие сайты не затрагиваются)
0. **Vercel:** каждый домен должен быть добавлен в свой проект (Settings → Domains): `oporamap.ru` и `www.oporamap.ru` в проект «Опора», `kontent.единаясреда.рф` в проект Content OS. «Invalid Configuration» после смены DNS на прокси — это нормально.
1. **Диагностика сервера** (только чтение): команда из чата, вывод пришлите мне.
2. **Установка прокси:** скопировать папку `deploy` на сервер и выполнить
   `sudo bash deploy/setup-vercel-proxy.sh oporamap.ru kontent.единаясреда.рф`
   Скрипт сам проверит конфиг (`nginx -t`), при ошибке откатит, и напечатает `PROXY_SECRET`.
3. **Проверка до смены DNS:** `curl -sI --resolve oporamap.ru:80:46.19.64.31 http://oporamap.ru/`.
4. **Vercel (проект «Опора»):** переменная `PROXY_SECRET` (значение из шага 2) + Redeploy. Без неё все посетители выглядят как один IP и ломаются лимиты и защита от накруток.
5. **DNS:**
   - `oporamap.ru`: у Timeweb A-запись → `46.19.64.31`; `www` → `CNAME oporamap.ru`.
   - `kontent.единаясреда.рф`: DNS у **Cloudflare**; заменить CNAME на **A-запись → `46.19.64.31`**, режим «DNS only» (серое облако), чтобы HTTPS завершался на вашем сервере.
6. **Сертификаты** (после обновления DNS):
   `sudo bash deploy/setup-vercel-proxy.sh cert you@mail.ru oporamap.ru kontent.единаясреда.рф`
7. **Проверка:** `https://oporamap.ru/api/health` → `"viaTrustedProxy": true`.

## Откат
- Вернуть DNS на Vercel: `oporamap.ru` A → `216.198.79.1`, `kontent` CNAME → `33ea5c61688d377b.vercel-dns-017.com` (значения из Vercel).
- Отключить домен на прокси: `sudo rm /etc/nginx/sites-enabled/vercel-proxy-ДОМЕН && sudo nginx -t && sudo systemctl reload nginx`.

## Особенности
- Таймаут ответа 65 с (маршруты, поиск, длинные запросы Content OS), буферизация выключена: страницы Next.js отдаются потоком.
- Автоопределение города по IP за прокси не работает (Vercel видит IP прокси): остаётся кнопка «По геопозиции». Вернуть можно через GeoIP на nginx (заголовки `X-Opora-Geo-Lat/Lng/Country`).
