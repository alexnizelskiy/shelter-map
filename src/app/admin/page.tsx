import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { adminEnabled, isAdmin } from "@/lib/admin-auth";
import { dbConfigured, ensureSchema, sql } from "@/lib/db";
import { loadShelters } from "@/lib/shelters-server";
import { loadCities } from "@/lib/cities-server";
import { distanceKm, fmtDate, type Shelter } from "@/lib/shelters";
import { BASIS_LABEL, REPORT_LABEL, SUGGEST_KIND_LABEL, type SuggestBasis, type SuggestKind } from "@/lib/reports";
import { approvePhoto, rejectPhoto, approveSuggestion, clearReports, logout, setHidden, setSuggestionState } from "./actions";
import LoginForm from "./LoginForm";
import { AdminSkeleton } from "@/components/skeletons";
import Cities from "./Cities";
import Chat from "./Chat";
import Requests from "./Requests";
import Access from "./Access";
import Bot from "./Bot";
import Stats from "./Stats";
import Broadcast from "./Broadcast";
import { operator } from "@/lib/operator";

export const metadata: Metadata = { title: "Модерация", robots: { index: false, follow: false } };

type SP = Promise<{ tab?: string; q?: string; result?: string; run?: string; test?: string; label?: string }>;

export default function AdminPage({ searchParams }: { searchParams: SP }) {
  return (
    <main className="adm">
      <Suspense fallback={<AdminSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const TABS = [["new", "Заявки"], ["need_info", "Уточнение"], ["problems", "Жалобы"], ["hidden", "Скрытые"], ["photos", "Фото"], ["access", "Доступность"], ["stats", "Статистика"], ["broadcast", "Рассылка"], ["bot", "Боты"], ["chat", "Чат"], ["requests", "Запросы"], ["done", "Обработанные"], ["cities", "Города и точки"]] as const;

async function Content({ searchParams }: { searchParams: SP }) {
  await connection();
  if (!adminEnabled()) return <p>Админка отключена: задайте переменную ADMIN_PASSWORD (не короче 8 символов) и перезапустите деплой.</p>;
  if (!dbConfigured()) return <p>Не задан DATABASE_URL.</p>;
  if (!(await isAdmin())) return <LoginForm />;

  await ensureSchema();
  const sp = await searchParams;
  const tab = sp.tab ?? "new";
  const cityList = await loadCities({ includeInactive: true });
  const all = (await Promise.all(cityList.map((c) => loadShelters(c.slug, { includeHidden: true })))).flat();
  const byId = new Map(all.map((s) => [s.id, s]));

  const [cnt] = await sql()<{ n: number; ni: number; p: number; ph: number; rq: number; ac: number }[]>`
    SELECT (SELECT count(*) FROM suggestions WHERE state='new')::int AS n,
           (SELECT count(*) FROM suggestions WHERE state='need_info')::int AS ni,
           (SELECT count(DISTINCT shelter_id) FROM shelter_reports WHERE created_at > now() - interval '7 days' AND kind IN ('closed','not_found','wrong_info'))::int AS p,
           (SELECT count(*) FROM shelter_photos WHERE state='new')::int AS ph,
           (SELECT count(*) FROM data_requests WHERE state='new')::int AS rq,
           (SELECT count(*) FROM access_suggestions WHERE state='new')::int AS ac`;
  const badge: Record<string, number> = { new: cnt.n, need_info: cnt.ni, problems: cnt.p, photos: cnt.ph, requests: cnt.rq, access: cnt.ac };

  return (
    <>
      <header className="adm-head">
        <h1>Модерация</h1>
        <form action={logout}><button className="btn-plain">Выйти</button></form>
      </header>
      {operator().missing.length > 0 && (
        <p className="warn" role="alert">В политике и соглашении не заполнены реквизиты оператора: {operator().missing.join(", ")}. Добавьте эти переменные в Vercel и сделайте Redeploy, пока сайт не опубликован.</p>
      )}
      <nav className="adm-tabs">
        {TABS.map(([k, label]) => (
          <a key={k} href={`/admin?tab=${k}`} className={tab === k ? "on" : ""}>
            {label}{badge[k] ? <span className="count">{badge[k]}</span> : null}
          </a>
        ))}
      </nav>
      {tab === "stats" ? <Stats label={sp.label} /> : tab === "broadcast" ? <Broadcast result={sp.result} run={sp.run} test={sp.test} /> : tab === "bot" ? <Bot result={sp.result} /> : tab === "access" ? <Access all={all} q={sp.q ?? ""} /> : tab === "requests" ? <Requests /> : tab === "chat" ? <Chat /> : tab === "photos" ? <Photos byId={byId} /> : tab === "cities" ? <Cities /> : tab === "problems" ? <Problems byId={byId} /> : tab === "hidden" ? <Hidden byId={byId} /> : <Suggestions state={tab} all={all} />}
    </>
  );
}

type SugRow = {
  id: number; city_slug: string; kind: SuggestKind; address: string; lat: number; lng: number; basis: SuggestBasis;
  source_url: string | null; comment: string | null; state: string; moderator_note: string | null; created_at: string;
};

async function Suggestions({ state, all }: { state: string; all: Shelter[] }) {
  const rows =
    state === "done"
      ? await sql()<SugRow[]>`SELECT * FROM suggestions WHERE state IN ('approved','rejected') ORDER BY reviewed_at DESC NULLS LAST, id DESC LIMIT 100`
      : await sql()<SugRow[]>`SELECT * FROM suggestions WHERE state = ${state === "need_info" ? "need_info" : "new"} ORDER BY id ASC LIMIT 100`;
  if (!rows.length) return <p className="note">Здесь пусто.</p>;
  return (
    <ul className="adm-list">
      {rows.map((r) => {
        let near: { s: Shelter; km: number } | null = null;
        for (const s of all) {
          const km = distanceKm(r.lat, r.lng, s.lat, s.lng);
          if (km < 0.15 && (!near || km < near.km)) near = { s, km };
        }
        return (
          <li key={r.id} className="adm-card">
            <div className="adm-title">
              <strong>{r.address}</strong>
              <span className="chip">{SUGGEST_KIND_LABEL[r.kind]}</span>
            </div>
            <p className="note">
              {BASIS_LABEL[r.basis]} · {new Date(r.created_at).toLocaleString("ru-RU")} ·{" "}
              <a target="_blank" rel="noreferrer" href={`https://yandex.ru/maps/?pt=${r.lng},${r.lat}&z=17&l=map`}>{r.lat.toFixed(5)}, {r.lng.toFixed(5)} на карте</a>
              {r.source_url && <> · <a target="_blank" rel="noreferrer" href={r.source_url}>ссылка заявителя</a></>}
            </p>
            {r.comment && <p>«{r.comment}»</p>}
            {near && <p className="warn">Рядом уже есть точка: {near.s.address}{near.s.holder ? ` (${near.s.holder})` : ""}, {Math.round(near.km * 1000)} м. Возможно, дубль.</p>}
            {(r.state === "approved" || r.state === "rejected") && <p className="note">Статус: {r.state === "approved" ? "добавлена на карту" : "отклонена"}{r.moderator_note ? ` — ${r.moderator_note}` : ""}</p>}
            {(r.state === "new" || r.state === "need_info") && (
              <>
                <form action={approveSuggestion} className="adm-form">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="address" defaultValue={r.address} required minLength={5} />
                  <select name="kind" defaultValue={r.kind === "official_shelter" ? "unknown" : r.kind}>
                    <option value="other_shelter">Другое укрытие</option>
                    <option value="help_point">Пункт помощи</option>
                    <option value="unknown">Тип не подтверждён</option>
                  </select>
                  <input name="note" placeholder="Заметка / организация (видна на карте)" />
                  <button className="primary">Одобрить и показать на карте</button>
                </form>
                <form action={setSuggestionState} className="adm-form adm-inline">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="note" placeholder="Причина (для себя)" />
                  <button name="state" value="need_info" className="btn-plain">Запросить уточнение</button>
                  <button name="state" value="rejected" className="btn-plain btn-danger">Отклонить</button>
                </form>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type RepRow = { shelter_id: string; open: number; closed: number; not_found: number; wrong_info: number; last_at: string };

async function Problems({ byId }: { byId: Map<string, Shelter> }) {
  const rows = await sql()<RepRow[]>`
    SELECT shelter_id,
      count(*) FILTER (WHERE kind='open')::int AS open, count(*) FILTER (WHERE kind='closed')::int AS closed,
      count(*) FILTER (WHERE kind='not_found')::int AS not_found, count(*) FILTER (WHERE kind='wrong_info')::int AS wrong_info,
      max(created_at) AS last_at
    FROM shelter_reports WHERE created_at > now() - interval '7 days'
    GROUP BY shelter_id
    HAVING count(*) FILTER (WHERE kind IN ('closed','not_found','wrong_info')) > 0
    ORDER BY count(*) FILTER (WHERE kind IN ('closed','not_found','wrong_info')) DESC, max(created_at) DESC LIMIT 100`;
  if (!rows.length) return <p className="note">За 7 дней жалоб нет.</p>;
  return (
    <ul className="adm-list">
      {rows.map((r) => {
        const s = byId.get(r.shelter_id);
        return (
          <li key={r.shelter_id} className="adm-card">
            <div className="adm-title"><strong>{s ? s.address : r.shelter_id}</strong>{s?.holder && <span className="chip">{s.holder}</span>}</div>
            <p className="note">
              {(["closed", "not_found", "wrong_info", "open"] as const).filter((k) => r[k] > 0).map((k) => `${REPORT_LABEL[k]}: ${r[k]}`).join(" · ")}
              {" · последнее "}{new Date(r.last_at).toLocaleString("ru-RU")}
              {s && <> · <a target="_blank" rel="noreferrer" href={`https://yandex.ru/maps/?pt=${s.lng},${s.lat}&z=18&l=map`}>на карте</a></>}
            </p>
            <div className="adm-inline">
              <form action={setHidden}><input type="hidden" name="shelterId" value={r.shelter_id} /><input type="hidden" name="hidden" value="1" /><button className="btn-plain btn-danger">Скрыть до проверки</button></form>
              <form action={clearReports}><input type="hidden" name="shelterId" value={r.shelter_id} /><button className="btn-plain">Проверено, сбросить отметки</button></form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function Hidden({ byId }: { byId: Map<string, Shelter> }) {
  const rows = await sql()<{ shelter_id: string; updated_at: string }[]>`SELECT shelter_id, updated_at FROM shelter_overrides WHERE hidden ORDER BY updated_at DESC`;
  if (!rows.length) return <p className="note">Скрытых точек нет.</p>;
  return (
    <ul className="adm-list">
      {rows.map((r) => {
        const s = byId.get(r.shelter_id);
        return (
          <li key={r.shelter_id} className="adm-card">
            <div className="adm-title"><strong>{s ? s.address : r.shelter_id}</strong>{s?.holder && <span className="chip">{s.holder}</span>}</div>
            <p className="note">Скрыта {fmtDate(new Date(r.updated_at).toISOString().slice(0, 10))}</p>
            <form action={setHidden}><input type="hidden" name="shelterId" value={r.shelter_id} /><input type="hidden" name="hidden" value="0" /><button className="btn-plain">Показать снова</button></form>
          </li>
        );
      })}
    </ul>
  );
}

async function Photos({ byId }: { byId: Map<string, Shelter> }) {
  const rows = await sql()<{ id: string; shelter_id: string; city_slug: string; size: number; created_at: string }[]>`SELECT id::text, shelter_id, city_slug, size, created_at FROM shelter_photos WHERE state = 'new' ORDER BY id ASC LIMIT 50`;
  if (!rows.length) return <p className="note">Новых фото нет.</p>;
  return (
    <ul className="adm-list">
      {rows.map((r) => {
        const s = byId.get(r.shelter_id);
        return (
          <li key={r.id} className="adm-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${r.id}`} alt="Фото на проверку" className="adm-photo" />
            <div className="adm-title"><strong>{s ? s.address : r.shelter_id}</strong><span className="chip">/{r.city_slug}</span><span className="chip">{Math.round(r.size / 1024)} КБ</span></div>
            <p className="note">Проверьте: нет людей, лиц, номеров автомобилей, охраняемых помещений, схем и планов. {new Date(r.created_at).toLocaleString("ru-RU")}</p>
            <div className="adm-inline">
              <form action={approvePhoto}><input type="hidden" name="id" value={r.id} /><button className="primary" style={{ width: "auto", padding: "10px 18px" }}>Показать в паспорте</button></form>
              <form action={rejectPhoto}><input type="hidden" name="id" value={r.id} /><button className="btn-plain btn-danger">Отклонить и удалить</button></form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
