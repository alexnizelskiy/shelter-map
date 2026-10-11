import { Suspense } from "react";
import Link from "next/link";
import { loadCities } from "@/lib/cities-server";

async function Cities() {
  const cities = await loadCities();
  return (
    <ul>
      {cities.map((c) => (
        <li key={c.slug}><Link href={`/${c.slug}`}>{c.name}</Link></li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="home">
      <h1>Карта укрытий</h1>
      <p>Выберите город</p>
      <Suspense fallback={null}>
        <Cities />
      </Suspense>
    </main>
  );
}
