"use client";

import Link from "next/link";
import { usePref } from "@/lib/use-pref";
import { CHOICE_KEY, CONFIRMED_KEY } from "./CitySearch";

// Ссылка на город в списке главной: выбор запоминается, чтобы на карте город не спрашивали заново
export default function CityLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [, setChoice] = usePref(CHOICE_KEY, "");
  const [, setConfirmed] = usePref(CONFIRMED_KEY, "");
  return <Link href={`/${slug}`} onClick={() => { setChoice(slug); setConfirmed("1"); }}>{children}</Link>;
}
