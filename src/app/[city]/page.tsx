import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CityView from "@/components/CityView";
import { CITIES, getCity } from "@/lib/cities";
import { loadShelters } from "@/lib/shelters-server";

export const generateStaticParams = () => CITIES.map((c) => ({ city: c.slug }));

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const city = getCity((await params).city);
  return city ? { title: `Убежища и укрытия — ${city.name}` } : {};
}

async function City({ params }: { params: Promise<{ city: string }> }) {
  const city = getCity((await params).city);
  if (!city) notFound();
  return <CityView city={city} shelters={await loadShelters(city.slug)} />;
}

export default function CityPage({ params }: { params: Promise<{ city: string }> }) {
  return (
    <Suspense fallback={null}>
      <City params={params} />
    </Suspense>
  );
}
