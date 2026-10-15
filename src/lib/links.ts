// Внешние ссылки сервиса. Значения по умолчанию — наши каналы и страница пожертвований; при необходимости переопределяются переменными Vercel.
export const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL || "https://pay.cloudtips.ru/p/b3cdc3d9";
export const TG_CHANNEL_URL = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_LINK || "https://t.me/rnd_opora";
export const MAX_CHANNEL_URL = process.env.NEXT_PUBLIC_MAX_CHANNEL_LINK || "https://max.ru/channel_rnd_opora";
export const SHARE_TEXT = "Карта укрытий рядом с домом: маршрут, отметки «открыто / закрыто», режим «Тревога». Бесплатно.";
