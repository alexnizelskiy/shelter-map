import type { Metadata } from "next";
import AlarmScreen from "@/components/AlarmScreen";

export const metadata: Metadata = { title: "Режим тревоги — ближайшее укрытие", description: "Ближайшее укрытие, расстояние и направление одним экраном. Работает без сети." };

export default function AlarmPage() {
  return <AlarmScreen />;
}
