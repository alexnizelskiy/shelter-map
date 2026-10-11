import type { Metadata } from "next";
import Link from "next/link";
import { Siren, WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Нет сети" };

// Показывается service worker'ом, когда страницы нет в кэше и сети тоже нет
export default function Offline() {
  return (
    <main className="home" style={{ textAlign: "center", paddingTop: 80 }}>
      <WifiOff size={44} />
      <h1>Нет сети</h1>
      <p className="note" style={{ margin: "0 0 20px" }}>Эту страницу пока нельзя открыть без интернета. Режим «Тревога» работает и без сети: расстояние и направление считаются на устройстве по сохранённому списку.</p>
      <Link href="/alarm" className="alarm-btn"><Siren size={20} />Режим «Тревога»</Link>
    </main>
  );
}
