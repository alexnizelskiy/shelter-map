"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Camera, ChevronLeft, ChevronRight, DoorOpen, FileText, HelpCircle, Info, MapPinPlus, ShieldCheck, Accessibility, FileSignature, ClipboardCheck, Trash2 } from "lucide-react";
import { usePref } from "@/lib/use-pref";
import { HELP_KEY, helpTotal, parseHelp } from "@/lib/my-help";
import { REPORT_TTL_HOURS } from "@/lib/reports";
import { RETENTION } from "@/lib/operator";

export const SUB_TITLE = { faq: "Частые вопросы", docs: "Документы", stats: "Ваша помощь" } as const;
export type SubView = keyof typeof SUB_TITLE;

// Шапка вложенного экрана «Профиля»: кнопка «назад» и название (как на экранах Документы, Частые вопросы)
export function SubHead({ view, onBack }: { view: SubView; onBack: () => void }) {
  return (
    <div className="sub-head">
      <button className="icon-btn big" aria-label="Назад" onClick={onBack}><ChevronLeft size={22} /></button>
      <h2>{SUB_TITLE[view]}</h2>
    </div>
  );
}

// ───── список входов в разделы на главном экране настроек ─────
export function ProfileLinks({ onOpen }: { onOpen: (v: SubView) => void }) {
  const [raw] = usePref(HELP_KEY, "");
  const total = helpTotal(parseHelp(raw));
  return (
    <>
      <button className="help-entry" onClick={() => onOpen("stats")}>
        <span className="ico ico-green"><BarChart3 size={20} /></span>
        <span className="set-text"><small>ВАША ПОМОЩЬ</small><b>Статистика отметок</b></span>
        {total > 0 && <span className="chip data">{total}</span>}
        <ChevronRight size={18} className="chev" />
      </button>
      <div className="card set-list">
        <button className="set-row" onClick={() => onOpen("faq")}>
          <span className="ico ico-blue"><HelpCircle size={18} /></span><b>Частые вопросы</b><ChevronRight size={18} className="chev" />
        </button>
        <button className="set-row" onClick={() => onOpen("docs")}>
          <span className="ico ico-amber"><FileText size={18} /></span><b>Документы</b><ChevronRight size={18} className="chev" />
        </button>
      </div>
    </>
  );
}

// ───── Документы ─────
const DOCS: { href: string; title: string; note: string; Icon: typeof Info; cls: string }[] = [
  { href: "/about", title: "О проекте и контакты", note: "Кто делает сервис, откуда данные, как связаться", Icon: Info, cls: "ico-blue" },
  { href: "/privacy", title: "Политика конфиденциальности", note: "Какие данные мы обрабатываем и как долго храним", Icon: ShieldCheck, cls: "ico-gray" },
  { href: "/terms", title: "Пользовательское соглашение", note: "Условия использования сервиса", Icon: FileSignature, cls: "ico-amber" },
  { href: "/rules", title: "Правила размещения отметок", note: "Что можно отмечать и писать в чате", Icon: ClipboardCheck, cls: "ico-green" },
  { href: "/data-request", title: "Запрос по данным", note: "Удалить профиль, скрыть или исправить сведения", Icon: Trash2, cls: "ico-gray" },
];

export function DocsView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <SubHead view="docs" onBack={onBack} />
      <div className="card set-list">
        {DOCS.map(({ href, title, note, Icon, cls }) => (
          <Link key={href} href={href} className="set-row">
            <span className={`ico ${cls}`}><Icon size={18} /></span>
            <span className="set-text"><b>{title}</b><small>{note}</small></span>
            <ChevronRight size={18} className="chev" />
          </Link>
        ))}
      </div>
    </>
  );
}

// ───── Частые вопросы ─────
type Faq = { title: string; items: { q: string; a: ReactNode }[] };
const FAQ: Faq[] = [
  {
    title: "Данные и карта",
    items: [
      { q: "Откуда берутся данные об укрытиях?", a: "Из открытых официальных источников: для Ростова-на-Дону это карта администрации города, для остальных населённых пунктов Ростовской области слой «Карта укрытий» ГИС Ростовской области. У каждой точки указаны источник и дата данных." },
      { q: "Что значат цвета точек на карте?", a: "Зелёный — защитное помещение из списка администрации. Синий — пункт помощи. Серый — добавлено жителями, официально не подтверждено. Жёлтый — жители сообщают о проблеме со входом." },
      { q: "Почему рядом с домом нет укрытия?", a: "Мы показываем только то, что есть в списках, а списки неполные и могут устареть. Если вы знаете укрытие, которого нет на карте, предложите его на вкладке «Добавить»: заявку проверит модератор." },
      { q: "Что такое «Радар»?", a: "Раздел с сообщениями из открытого канала «Радар по всей России» (t.me/radarrussiia) за последние сутки: время сообщения и текст. Реклама и подпись канала не показываются, сообщения старше суток удаляются. Это неофициальная информация, мы её не проверяем: официальные оповещения даёт МЧС." },
      { q: "Можно ли полностью доверять карте?", a: "Нет. Информация справочная: не гарантия безопасности и доступности входа. Следуйте оповещениям МЧС и указаниям экстренных служб." },
    ],
  },
  {
    title: "Как пользоваться",
    items: [
      { q: "Как отметить, открыто укрытие или закрыто?", a: `Откройте точку и в блоке «Сообщения жителей» нажмите «Вход открыт», «Вход закрыт», «Не удалось найти вход» или «Адрес неверен». Отметка устаревает через ${REPORT_TTL_HOURS} ч. Если несколько человек пишут о проблеме, точка на карте становится жёлтой.` },
      { q: "Как добавить новое место или фото?", a: "Новое место — вкладка «Добавить»: укажите адрес, отметьте точку на карте и основание. Фото — кнопка «Предложить фото» в паспорте укрытия. И заявки, и фото сначала проверяет модератор." },
      { q: "Как построить маршрут?", a: "Откройте точку и нажмите «Пешком» или «На машине». Можно включить навигатор: он ведёт по маршруту, пересчитывает его, если вы свернули, и подсказывает голосом." },
      { q: "Что такое режим «Тревога» и работает ли он без интернета?", a: "Это одна кнопка: ближайшее укрытие, расстояние и направление по компасу. Режим открывается без подписки и без входа. Чтобы он работал без сети, сохраните список на устройстве (Настройки → Приложение и офлайн) и установите сервис как приложение." },
    ],
  },
  {
    title: "Аккаунт и общение",
    items: [
      { q: "Нужно ли входить в аккаунт?", a: "Карта, маршруты, отметки и заявки работают без входа. Вход через Яндекс ID, VK ID, Telegram или MAX нужен только для записи в чате." },
      { q: "Видно ли другим, что отметку поставил я?", a: `Нет, отметки анонимны. Для защиты от накруток мы храним только необратимый хэш IP-адреса: отметки ${RETENTION.reportsDays} дней, хэш в заявках ${RETENTION.ipHashDays} дней.` },
      { q: "Что видят другие в чате?", a: "Ваше имя и первую букву фамилии, а также аватар из выбранного сервиса. Только текст, без картинок. Сообщения периодически удаляются: время очистки показано над перепиской." },
      { q: "Что такое «Ваша помощь»?", a: "Личный счётчик на этом устройстве: сколько отметок, заявок и фото вы отправили. Он нигде не публикуется и не привязан к аккаунту." },
    ],
  },
  {
    title: "Если что-то не так",
    items: [
      { q: "Карта не загружается или не видит меня", a: "Проверьте интернет и разрешение на доступ к геопозиции в браузере. Без сети откройте режим «Тревога»: он работает по сохранённому списку. Некоторые карты могут не открываться при включённом VPN или блокировщиках." },
      { q: "Я нашёл ошибку в данных", a: "Откройте точку и нажмите «Адрес или описание неверны», а если вы собственник или представитель объекта, отправьте запрос по данным (Документы → Запрос по данным)." },
      { q: "Как удалить мои данные?", a: "Профиль чата можно удалить кнопкой в чате. Остальные запросы отправьте через «Документы → Запрос по данным»: мы ответим в сроки, установленные законом." },
    ],
  },
];

export function FaqView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <SubHead view="faq" onBack={onBack} />
      {FAQ.map((g) => (
        <div key={g.title} className="faq-group">
          <h3>{g.title}</h3>
          {g.items.map((it) => (
            <details key={it.q} className="faq-item card">
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      ))}
    </>
  );
}

// ───── Ваша помощь ─────
type Community = { reports24h: number; reports7d: number; places30d: number };
const fmtDate = (iso: string) => iso.split("-").reverse().join(".");
const plural = (n: number, one: string, few: string, many: string) => { const m = n % 100, d = n % 10; return m >= 11 && m <= 14 ? many : d === 1 ? one : d >= 2 && d <= 4 ? few : many; };

export function HelpView({ onBack }: { onBack: () => void }) {
  const [raw] = usePref(HELP_KEY, "");
  const h = parseHelp(raw);
  const total = helpTotal(h);
  const [c, setC] = useState<Community | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/community-stats").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j) setC(j as Community); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const rows: { Icon: typeof Info; label: string; n: number }[] = [
    { Icon: DoorOpen, label: "Отметок о входе", n: h.reports },
    { Icon: MapPinPlus, label: "Предложено мест", n: h.suggestions },
    { Icon: Camera, label: "Отправлено фото", n: h.photos },
    { Icon: Accessibility, label: "Уточнений о доступности", n: h.access },
  ];
  return (
    <>
      <SubHead view="stats" onBack={onBack} />
      <div className="card help-card">
        <small>ВЫ ПОМОГЛИ КАРТЕ</small>
        <div className="help-big"><b>{total.toLocaleString("ru-RU")}</b><span>{plural(total, "вклад", "вклада", "вкладов")}</span></div>
        {h.since && <p className="note">С {fmtDate(h.since)} на этом устройстве</p>}
      </div>
      {total === 0 && (
        <div className="card help-empty">
          <span className="ico ico-green"><BarChart3 size={20} /></span>
          <b>История только началась</b>
          <p className="note">Отметьте, открыто ли укрытие рядом, или добавьте место, которого нет на карте. Здесь появится ваш первый вклад.</p>
        </div>
      )}
      <h3 className="faq-h">Ваша активность</h3>
      <div className="card set-list">
        {rows.map(({ Icon, label, n }) => (
          <div key={label} className="set-row static"><span className="ico ico-gray"><Icon size={17} /></span><b>{label}</b><span className="set-val">{n}</span></div>
        ))}
      </div>
      <h3 className="faq-h">Сообщество</h3>
      <div className="card set-list">
        <div className="set-row static"><b>Отметок о входе за сутки</b><span className="set-val">{c ? c.reports24h.toLocaleString("ru-RU") : "…"}</span></div>
        <div className="set-row static"><b>Отметок за 7 дней</b><span className="set-val">{c ? c.reports7d.toLocaleString("ru-RU") : "…"}</span></div>
        <div className="set-row static"><b>Новых мест от жителей за 30 дней</b><span className="set-val">{c ? c.places30d.toLocaleString("ru-RU") : "…"}</span></div>
      </div>
      <p className="note">Личный счётчик хранится только на этом устройстве: отметки анонимны.</p>
    </>
  );
}
