"use client";

import { useState } from "react";
import { Globe, HeartHandshake, Send, Share2 } from "lucide-react";
import { DONATE_URL, MAX_CHANNEL_URL, SHARE_TEXT, TG_CHANNEL_URL } from "@/lib/links";

// Просьба о поддержке: суммы и ссылка на страницу пожертвований (используется отдельно и внутри «Мы на связи»)
function DonateBody() {
  return (
    <>
      <h4><HeartHandshake size={17} />Поддержать проект</h4>
      <p className="note">Карта бесплатна и останется такой: мы на ней не зарабатываем. Пожертвования идут на серверы, трафик и защиту от атак. Они добровольные и ничего не дают взамен.</p>
      <div className="donate-amounts">
        {[100, 300, 500].map((n) => <a key={n} href={`${DONATE_URL}?amount=${n}`} target="_blank" rel="noreferrer">{n} ₽</a>)}
        <a href={DONATE_URL} target="_blank" rel="noreferrer">Другая</a>
      </div>
      <p className="note"><Globe size={13} style={{ verticalAlign: "-2px" }} /> Оплата на странице сервиса CloudTips: СБП или карта.</p>
    </>
  );
}

// Отдельная карточка «Поддержать проект» (первый блок в настройках)
export function DonateBlock() {
  return (
    <section className="contact donate-card" aria-label="Поддержать проект">
      <DonateBody />
    </section>
  );
}

// «Мы на связи»: каналы в MAX и Telegram, кнопка «Поделиться картой» и добровольные пожертвования
export default function ContactBlock({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/?src=share`; // метка «share»: видно в статистике, сколько людей пришло по ссылкам друзей
    const data = { title: "Опора — карта укрытий", text: SHARE_TEXT, url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch { return; } // человек закрыл окно «Поделиться»
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { window.prompt("Скопируйте ссылку", url); }
  };

  return (
    <section className={compact ? "contact compact" : "contact"} aria-label="Мы на связи">
      <h3>Мы на связи <span aria-hidden="true">💚</span></h3>
      <p className="note">В каналах — новости сервиса и всегда рабочая ссылка на карту.</p>
      <div className="contact-ch">
        <a className="ch ch-max" href={MAX_CHANNEL_URL} target="_blank" rel="noreferrer">
          <span className="ico"><Send size={20} /></span><b>Канал в MAX</b><small>новости сервиса</small>
        </a>
        <a className="ch ch-tg" href={TG_CHANNEL_URL} target="_blank" rel="noreferrer">
          <span className="ico"><Send size={20} /></span><b>Канал в Telegram</b><small>{TG_CHANNEL_URL.replace(/^https?:\/\/t\.me\//, "@")}</small>
        </a>
      </div>
      <button className="share-btn" onClick={share}><Share2 size={16} /><span><b>Поделиться картой</b> с друзьями</span></button>
      {copied && <p className="note ok-note" role="status">Ссылка скопирована</p>}

      <div className="donate">
        <DonateBody />
      </div>
    </section>
  );
}
