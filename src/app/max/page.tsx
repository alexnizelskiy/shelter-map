import type { Metadata } from "next";
import TgGate from "@/components/TgGate";

// Точка входа мини-приложения MAX (этот адрес указывается в настройках бота на платформе MAX): не индексируется
export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: false } };

export default function MaxPage() {
  return <TgGate platform="max" />;
}
