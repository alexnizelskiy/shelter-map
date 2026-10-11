import { Suspense } from "react";
import Link from "next/link";
import { loadCities } from "@/lib/cities-server";
import HomeSearch from "@/components/HomeSearch";
import { HomeSkeleton } from "@/components/skeletons";

async function Cities() {
  const cities = await loadCities();
  return (
    <>
      <h2>Города с данными</h2>
      <ul>
        {cities.map((c) => (
          <li key={c.slug}><Link href={`/${c.slug}`}>{c.name}</Link></li>
        ))}
      </ul>
    </>
  );
}

export default function Home() {
  return (
    <main className="home">
      <h1>Карта укрытий</h1>
      <p className="note" style={{ margin: "0 0 16px" }}>Найдите свой город, посёлок или село. Мы покажем карту и ближайшие укрытия.</p>
      <HomeSearch />
      <Suspense fallback={<HomeSkeleton />}>
        <Cities />
      </Suspense>
    </main>
  );
}
