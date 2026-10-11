import Link from "next/link";
import { CITIES } from "@/lib/cities";

export default function Home() {
  return (
    <main className="home">
      <h1>Карта укрытий</h1>
      <p>Выберите город</p>
      <ul>
        {CITIES.map((c) => (
          <li key={c.slug}><Link href={`/${c.slug}`}>{c.name}</Link></li>
        ))}
      </ul>
    </main>
  );
}
