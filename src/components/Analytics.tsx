"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Считает посещения страниц без cookie. Метка ссылки (?src=… или ?utm_source=…) и канал (сайт / приложение / Telegram / MAX)
// запоминаются на время вкладки в sessionStorage, ничего не сохраняется в браузере надолго.
export default function Analytics() {
  const path = usePathname();
  useEffect(() => {
    if (!path || path.startsWith("/admin")) return;
    try {
      if (navigator.doNotTrack === "1") return;
      const q = new URLSearchParams(location.search);
      const fromUrl = q.get("src") || q.get("utm_source") || "";
      if (fromUrl) sessionStorage.setItem("opora_src", fromUrl);
      const src = sessionStorage.getItem("opora_src") ?? "";
      let ch = sessionStorage.getItem("opora_ch") ?? "";
      if (!ch) ch = matchMedia("(display-mode: standalone)").matches ? "pwa" : "web";
      let ref = "";
      try { const h = document.referrer ? new URL(document.referrer).hostname : ""; if (h && h !== location.hostname) ref = h.replace(/^www\./, ""); } catch { /* пустой referrer */ }
      const key = `hit:${path}`;
      if (sessionStorage.getItem(key)) return; // одну страницу за вкладку считаем один раз
      sessionStorage.setItem(key, "1");
      const body = JSON.stringify({ path, src, ref, ch });
      if (!navigator.sendBeacon?.("/api/hit", new Blob([body], { type: "application/json" }))) fetch("/api/hit", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    } catch { /* хранилище недоступно: просто не считаем */ }
  }, [path]);
  return null;
}
