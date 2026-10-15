// «Радар»: разбор публичной страницы канала t.me/s/<канал>. Чистые функции без сети и базы: их проверяют автотесты.
export type RawPost = { id: number; at: string; html: string };
export type RadarPost = { id: number; at: string; text: string; region: string };

const wrapRe = /class="tgme_widget_message_wrap/;

// Список постов со страницы: номер, время (ISO), HTML текста. Посты без текста (одна картинка) пропускаются.
export function parseChannelHtml(html: string): RawPost[] {
  const out: RawPost[] = [];
  for (const chunk of html.split(wrapRe).slice(1)) {
    const id = /data-post="[^"/]+\/(\d+)"/.exec(chunk)?.[1];
    const at = /<time[^>]*datetime="([^"]+)"/.exec(chunk)?.[1];
    const body = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1];
    if (id && at && body && !Number.isNaN(Date.parse(at))) out.push({ id: Number(id), at: new Date(at).toISOString(), html: body });
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });

// Строки подписи канала («Радар по всей России - @…», «Наш канал в МАХ - …»): на нашем сайте не показываем, источник указан отдельно
const SIGNATURE = [/radarrussiia/i, /Радар по всей России/i, /Наш канал в М[АA]Х/i, /max\.ru\//i];
const EMPTY_LINE = /^[\s❗️‼️⚠️📲•\-–—·]*$/u;

export function cleanText(html: string): string {
  const plain = decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
  const lines = plain.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter((l) => !SIGNATURE.some((re) => re.test(l)));
  const out: string[] = [];
  for (const l of lines) {
    if (EMPTY_LINE.test(l)) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
    out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

// Реклама и спам: маркировка (erid), промокоды, призывы подписаться, чужие ссылки и каналы, типичные рекламные темы.
// Сообщения радара — короткий текст без ссылок, поэтому любая ссылка или @-упоминание после удаления подписи считается рекламой.
// Внимание: \b в JavaScript не работает с кириллицей, поэтому границы слов задаются через \p{L}
const AD = [
  /erid\s*[:=]/i, /реклам/i, /на правах рекламы/i, /(?<!\p{L})promo/iu, /промокод/i, /скидк/i, /розыгрыш/i, /(?<!\p{L})акци[яи](?!\p{L})/iu,
  /подписывайтесь|подписаться|подпишись|подписывайся/i, /переходи(те)? по ссылке/i, /https?:\/\//i, /(^|\s)@[A-Za-z0-9_]{4,}/, /(?<!\p{L})t\.me\//iu,
  /(?<!\p{L})куп(и|ить|ите)(?!\p{L})/iu, /(?<!\p{L})закажи(те)?(?!\p{L})/iu, /доставк/i, /казино|букмекер|ставк[аи] на спорт|(?<!\p{L})займ(?!\p{L})|кредит|ипотек/iu,
];
export const isAd = (text: string) => AD.some((re) => re.test(text));

// Регион из первых строк поста: «Тульская область», «Республика Крым», «Москва»
const REGION = /област|(?<!\p{L})кра[йя](?!\p{L})|республик|округ|(?<!\p{L})АО(?!\p{L})|^Москва|^Санкт-Петербург|^Севастополь/iu;
export function regionOf(text: string): string {
  const first = text.split("\n").filter(Boolean).slice(0, 3);
  const line = first.find((l) => REGION.test(l) && l.length <= 60);
  return line ? line.replace(/\s+/g, " ").trim() : "";
}

// Из сырого поста — готовая запись или null (пустой текст, реклама)
export function toRadarPost(raw: RawPost): RadarPost | null {
  const text = cleanText(raw.html);
  if (text.length < 3 || isAd(text)) return null;
  return { id: raw.id, at: raw.at, text: text.slice(0, 1200), region: regionOf(text) };
}
