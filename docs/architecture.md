# Архитектура

## Принципы
- Мультигород с первого дня: город = запись в таблице `cities`, а не код. Первый город — `rostov-na-donu`, остальные добавляются данными.
- Один веб-клиент на три входа: сайт, Telegram Mini App, MAX Mini App.
- Достоверность в схеме: у каждой точки источник и дата проверки.

## Стек
- Next.js (App Router) + TypeScript, отдельный репозиторий.
- MapLibre GL JS + векторные тайлы на базе OSM (Protomaps PMTiles на своём хранилище), атрибуция OSM на карте.
- PostgreSQL (Timeweb, РФ). Поиск ближайшего: PostGIS либо расчёт на клиенте по списку города (сотни точек).
- Бот: grammY/Telegraf, вебхук на Next API.

## Страницы
- `/` — выбор города.
- `/[city]` (например `/rostov-na-donu`) — список + карта, фильтры по типу, кнопка «Ближайшее», SEO-текст города.
- `/[city]/[id]` — карточка: адрес, ориентир, вместимость, источник, дата проверки, отметки жителей.
- `/suggest` — предложить место.
- `/admin` — очередь заявок и жалоб.

## Данные
```
cities(id, slug, name, center, bbox, is_active)
shelters(id, city_id, kind, name, address, landmark, capacity, lat, lng,
         source_type, source_url, source_checked_at, status_verified, hidden)
reports(id, shelter_id, user_hash, kind, created_at)       -- open/closed/not_found/wrong
submissions(id, city_id, payload, user_hash, state, created_at)
shelter_history(id, shelter_id, change, actor, created_at)
users(tg_id_hash, subscribed_at, urgent_pass_until, consent_at)
```
`kind`: `official_shelter | other_shelter | help_point | unknown`.
Отметка жителя живёт N часов, потом статус «не подтверждено».

## Гейт подписки
1. `/start` в боте → согласие с политикой → проверка `getChatMember(channel, user)`; бот админ канала.
2. Кнопка «Открыть карту» (WebApp) → клиент шлёт `initData`.
3. Сервер валидирует подпись `initData` (HMAC с токеном бота), **на каждом запросе API** проверяет подписку (кэш ~60 с) — не только в UI.
4. Кнопка «Срочно — без подписки»: выдаёт `urgent_pass_until = now + 24h`, не чаще раза в сутки.

## Импорт Ростова
1. Скачать опубликованный администрацией список, сохранить исходник в репозиторий (`data/raw/`), записать URL и дату.
2. Геокодировать адреса (разово), вручную проверить выбросы.
3. Загрузить в `shelters` с `source_type=official_admin`.

## Этапы
1. Каркас, схема БД, страница города, импорт Ростова.
2. Бот + гейт + Mini App.
3. Отметки, предложения, админка.
4. Юридические документы, уведомление РКН, пилот.
5. Новые города, MAX, монетизация организациям.
