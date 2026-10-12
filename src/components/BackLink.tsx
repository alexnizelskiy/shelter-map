"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// «Назад»: возвращает на прошлую страницу, а если истории нет (открыли ссылку напрямую) — на главную
export default function BackLink({ label = "Назад" }: { label?: string }) {
  const router = useRouter();
  return (
    <Link
      href="/"
      className="legal-back"
      onClick={(e) => {
        if (window.history.length > 1) { e.preventDefault(); router.back(); }
      }}
    >
      <ArrowLeft size={16} />{label}
    </Link>
  );
}
