import Link from "next/link";
import { LEGAL_DATE_RU, operator } from "@/lib/operator";
import BackLink from "./BackLink";

// Реквизит оператора: если переменная окружения не заполнена, на странице видна жёлтая метка, а не пустота
export function Op({ field }: { field: "name" | "inn" | "email" | "address" }) {
  const o = operator();
  const env = { name: "OPERATOR_NAME", inn: "OPERATOR_INN", email: "OPERATOR_EMAIL", address: "OPERATOR_ADDRESS" }[field];
  return o[field] ? <>{o[field]}</> : <mark className="missing">[не заполнено: {env}]</mark>;
}

export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="Документы">
      <Link href="/privacy">Политика обработки данных</Link>
      <Link href="/terms">Пользовательское соглашение</Link>
      <Link href="/rules">Правила чата</Link>
      <Link href="/data-request">Запрос по данным</Link>
    </nav>
  );
}

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal">
      <BackLink />
      <h1>{title}</h1>
      <p className="note" style={{ marginLeft: 0 }}>Редакция от {LEGAL_DATE_RU}</p>
      {children}
      <LegalLinks />
    </main>
  );
}
