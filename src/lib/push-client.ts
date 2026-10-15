import { readPref, writePref } from "./use-pref";
import type { PushScope } from "./push-shared";

// Подписка браузера на уведомления «Радара». Выбор (регион или вся Россия) запоминается и на устройстве, и на сервере.
export const PUSH_KEY = "radar-push"; // JSON {scope, region}: подписка включена
export const PUSH_ASKED_KEY = "radar-push-asked"; // предложение в «Радаре» показывалось (один раз)

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";
export type PushChoice = { scope: PushScope; region: string };

export const isIosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as unknown as { standalone?: boolean }).standalone && !matchMedia("(display-mode: standalone)").matches;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function parseChoice(raw: string): PushChoice | null {
  try { const j = JSON.parse(raw); return j && (j.scope === "all" || j.scope === "region") ? { scope: j.scope, region: typeof j.region === "string" ? j.region : "" } : null; } catch { return null; }
}

export const baseState = (): PushState => {
  if (isIosBrowser() && !pushSupported()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "off";
};

const b64 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type PushResult = { ok: true } | { ok: false; reason: "denied" | "unsupported" | "server" | "error" };

// Включить или изменить выбор: запрашивает разрешение (только по нажатию человека), подписывает устройство и сообщает серверу
export async function enablePush(choice: PushChoice, url: string): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "denied" };
    const cfg = await (await fetch("/api/push/config", { cache: "no-store" })).json().catch(() => ({}));
    if (!cfg.enabled || !cfg.publicKey) return { ok: false, reason: "server" };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(cfg.publicKey) as BufferSource });
    const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), scope: choice.scope, region: choice.region, url }) });
    if (!r.ok) return { ok: false, reason: "server" };
    writePref(PUSH_KEY, JSON.stringify(choice));
    return { ok: true };
  } catch { return { ok: false, reason: "error" }; }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* нет подписки или воркера: просто снимаем отметку */ }
  writePref(PUSH_KEY, "");
}

// Сверка: если в браузере подписки уже нет (разрешение отозвано, данные сайта очищены), снимаем отметку «включено»
export async function syncPush(): Promise<void> {
  if (!pushSupported() || !readPref(PUSH_KEY)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!(await reg.pushManager.getSubscription()) || Notification.permission !== "granted") writePref(PUSH_KEY, "");
  } catch { /* воркер недоступен */ }
}
