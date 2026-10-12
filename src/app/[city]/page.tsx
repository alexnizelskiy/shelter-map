import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CityView from "@/components/CityView";
import { CityPageSkeleton } from "@/components/skeletons";
import { CITIES, getCity } from "@/lib/cities";
import { loadAnyCity } from "@/lib/cities-server";
import { loadShelters } from "@/lib/shelters-server";

export const generateStaticParams = () => CITIES.map((c) => ({ city: c.slug }));

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const city = getCity((await params).city);
  return { title: city ? `Укрытия — ${city.name}` : "Укрытия" };
}

async function City({ params }: { params: Promise<{ city: string }> }) {
  const city = await loadAnyCity((await params).city);
  if (!city) notFound();
  return <CityView key={city.slug} city={city} shelters={await loadShelters(city.slug)} />;
}

export default function CityPage({ params }: { params: Promise<{ city: string }> }) {
  return (
    <Suspense fallback={<CityPageSkeleton />}>
      <City params={params} />
    </Suspense>
  );
}
