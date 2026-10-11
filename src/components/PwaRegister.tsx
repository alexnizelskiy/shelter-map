"use client";

import { useEffect } from "react";

// Регистрирует service worker (только в боевой сборке) и запоминает событие установки приложения
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`).catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __installPrompt?: Event }).__installPrompt = e;
      window.dispatchEvent(new Event("install-available"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}
