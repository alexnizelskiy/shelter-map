import type { Metadata } from "next";
import TgGate from "@/components/TgGate";

// Точка входа мини-приложения Telegram: не индексируется
export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: false } };

export default function TgPage() {
  return <TgGate />;
}
