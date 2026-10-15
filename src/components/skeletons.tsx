// Скелетоны загрузки. Без хуков, поэтому подходят и для серверных компонентов (Suspense fallback).
type Box = { w?: number | string; h?: number | string; r?: number | string; className?: string };

export function Skel({ w = "100%", h = 14, r = 10, className = "" }: Box) {
  return <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

export function RowsSkeleton({ n = 5 }: { n?: number }) {
  return (
    <ul className="list" role="status" aria-label="Загрузка">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="row skel-row">
          <Skel w={38} h={38} r={12} />
          <span className="row-main" style={{ gap: 6 }}>
            <Skel w={`${55 + ((i * 17) % 35)}%`} h={14} />
            <Skel w={`${35 + ((i * 23) % 30)}%`} h={11} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// Чат: шапка, несколько пузырей слева и справа, поле ввода
export function ChatSkeleton() {
  const bubbles: { mine: boolean; w: number; lines: number }[] = [
    { mine: false, w: 68, lines: 1 }, { mine: false, w: 86, lines: 2 }, { mine: true, w: 56, lines: 1 },
    { mine: false, w: 74, lines: 2 }, { mine: false, w: 48, lines: 1 },
  ];
  return (
    <div className="chat" role="status" aria-label="Загружаем чат">
      <div className="chat-head"><Skel w={150} h={30} r={999} /><Skel w={44} h={22} r={999} /></div>
      <div className="chat-list" style={{ overflow: "hidden" }}>
        {bubbles.map((b, i) => (
          <div key={i} className={b.mine ? "msg mine" : "msg"}>
            {!b.mine && <Skel w={36} h={36} r="50%" />}
            <div className="bubble skel-bubble" style={{ width: `${b.w}%` }}>
              <Skel w="38%" h={12} />
              {Array.from({ length: b.lines }, (_, k) => <Skel key={k} w={k === b.lines - 1 && b.lines > 1 ? "60%" : "100%"} h={13} />)}
            </div>
          </div>
        ))}
      </div>
      <div className="composer-row" style={{ paddingTop: 8 }}><Skel h={46} r={999} /><Skel w={46} h={46} r="50%" /></div>
    </div>
  );
}

// Страница города, пока приходят данные: ровный фон карты, на телефоне плашки сверху и док, на компьютере форма левой панели
export function CityPageSkeleton() {
  return (
    <div className="app" role="status" aria-label="Загрузка">
      <div className="map-skel" />
      <div className="map-bar" aria-hidden="true">
        <Skel w={210} h={46} r={999} />
        <Skel w={44} h={44} r={999} />
      </div>
      <aside className="side">
        <section className="panel glass skel-panel">
          <div className="large-title"><Skel w={170} h={30} /><Skel w={120} h={28} r={999} /></div>
          <Skel h={50} r={16} />
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="card stat"><Skel w={34} h={34} r={12} /><Skel w="60%" h={22} /><Skel w="80%" h={11} /></div>
            <div className="card stat"><Skel w={34} h={34} r={12} /><Skel w="60%" h={22} /><Skel w="80%" h={11} /></div>
          </div>
          <div className="card group" style={{ padding: 14, display: "grid", gap: 10 }}>
            <Skel w="70%" h={14} /><Skel w="90%" h={11} /><Skel w="60%" h={14} /><Skel w="85%" h={11} />
          </div>
        </section>
        <nav className="dock glass" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => <span key={i} className="dock-tab"><Skel w={24} h={24} r={8} /><Skel w={36} h={8} r={4} /></span>)}
        </nav>
      </aside>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div role="status" aria-label="Загрузка">
      <Skel w={160} h={14} className="home-skel" />
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {[0, 1, 2].map((i) => <li key={i}><Skel h={52} r={18} /></li>)}
      </ul>
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div role="status" aria-label="Загрузка" style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <Skel w={180} h={26} />
      <div style={{ display: "flex", gap: 8 }}>{[90, 110, 80, 100].map((w, i) => <Skel key={i} w={w} h={36} r={999} />)}</div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="adm-card" style={{ gap: 10 }}><Skel w="55%" h={16} /><Skel w="80%" h={12} /><Skel w={160} h={38} r={12} /></div>
      ))}
    </div>
  );
}
