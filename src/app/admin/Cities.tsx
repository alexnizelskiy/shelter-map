import { loadCities } from "@/lib/cities-server";
import { sql } from "@/lib/db";
import { SUGGEST_KIND_LABEL } from "@/lib/reports";
import { addCity, addShelter, deleteShelter, setCityActive } from "./actions";

type Pub = { id: string; city_slug: string; kind: string; address: string; holder: string | null; capacity: number | null; lat: number; lng: number };

export default async function Cities() {
  const cities = await loadCities({ includeInactive: true });
  const rows = await sql()<Pub[]>`SELECT id::text, city_slug, kind, address, holder, capacity, lat, lng FROM published_shelters ORDER BY id DESC LIMIT 200`;
  const label = (k: string) => (k === "official_shelter" ? "Официальное убежище" : SUGGEST_KIND_LABEL[k as keyof typeof SUGGEST_KIND_LABEL] ?? k);

  return (
    <>
      <h2 className="adm-section">Города</h2>
      <ul className="adm-list">
        {cities.map((c) => (
          <li key={c.slug} className="adm-card">
            <div className="adm-title">
              <strong>{c.name}</strong><span className="chip">/{c.slug}</span>
              <span className="chip">{c.dynamic ? (c.active ? "из админки" : "отключён") : "встроенный"}</span>
            </div>
            <p className="note">Центр: {c.center[1].toFixed(4)}, {c.center[0].toFixed(4)} · масштаб {c.zoom}</p>
            {c.dynamic && (
              <form action={setCityActive}>
                <input type="hidden" name="slug" value={c.slug} />
                <button name="active" value={c.active ? "0" : "1"} className="btn-plain">{c.active ? "Отключить город" : "Включить город"}</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <h2 className="adm-section">Добавить город</h2>
      <form action={addCity} className="adm-card adm-form">
        <div className="adm-grid">
          <label>Название *<input name="name" required placeholder="Таганрог" /></label>
          <label>Адрес в URL (латиницей, можно пустым)<input name="slug" placeholder="taganrog" /></label>
          <label className="wide">Координаты центра * (широта, долгота)<input name="coords" required placeholder="47.2362, 38.8969" /></label>
          <label>Масштаб карты (5–16)<input name="zoom" type="number" min={5} max={16} defaultValue={11} /></label>
          <label>Радиус города, км (для проверки заявок)<input name="radius" type="number" min={3} max={300} defaultValue={25} /></label>
        </div>
        <button className="primary">Добавить город</button>
      </form>

      <h2 className="adm-section">Добавить точку</h2>
      <form action={addShelter} className="adm-card adm-form">
        <div className="adm-grid">
          <label>Город *<select name="city" required>{cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
          <label>Тип *
            <select name="kind" defaultValue="other_shelter">
              <option value="official_shelter">Официальное убежище (нужна ссылка)</option>
              <option value="other_shelter">Защитное помещение / укрытие</option>
              <option value="help_point">Пункт помощи</option>
              <option value="unknown">Тип не подтверждён</option>
            </select>
          </label>
          <label className="wide">Адрес *<input name="address" required minLength={3} placeholder="ул. Ленина, 10" /></label>
          <label className="wide">Координаты * (широта, долгота)<input name="coords" required placeholder="47.2224, 39.7203" /></label>
          <label>Вид объекта<input name="objectType" placeholder="Заглублённое помещение" /></label>
          <label>Расположение<input name="placement" placeholder="здании / МКД / подземном переходе" /></label>
          <label>Организация / ориентир<input name="holder" placeholder="ТРЦ «Название»" /></label>
          <label>Вместимость, чел.<input name="capacity" type="number" min={1} /></label>
          <label className="wide">Ссылка на источник (обязательна для «официального»)<input name="sourceUrl" type="url" placeholder="https://" /></label>
        </div>
        <button className="primary">Добавить точку</button>
      </form>

      <h2 className="adm-section">Точки, добавленные из админки и заявок</h2>
      {rows.length === 0 ? <p className="note">Пока нет.</p> : (
        <ul className="adm-list">
          {rows.map((r) => (
            <li key={r.id} className="adm-card">
              <div className="adm-title"><strong>{r.address}</strong><span className="chip">{label(r.kind)}</span><span className="chip">/{r.city_slug}</span></div>
              <p className="note">{r.holder ? `${r.holder} · ` : ""}{r.capacity ? `до ${r.capacity} чел. · ` : ""}{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</p>
              <form action={deleteShelter}><input type="hidden" name="id" value={r.id} /><button className="btn-plain btn-danger">Удалить с карты</button></form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
