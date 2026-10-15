"use client";

import { useSyncExternalStore } from "react";

// Небольшое хранилище предпочтений в localStorage; useSyncExternalStore держит HTML сервера и клиента одинаковым.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
};

// Чтение и запись вне компонентов (например, счётчик помощи): подписчики обновятся так же, как при usePref
export const readPref = (key: string, fallback = ""): string => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
export function writePref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch {}
  listeners.forEach((l) => l());
}

export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    () => fallback,
  );
  const set = (v: string) => {
    try { localStorage.setItem(key, v); } catch {}
    listeners.forEach((l) => l());
  };
  return [value, set];
}
