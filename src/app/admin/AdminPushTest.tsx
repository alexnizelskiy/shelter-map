"use client";

import { useState } from "react";
import { enablePush } from "@/lib/push-client";

// Включает уведомления на устройстве администратора и помечает его тестовым: тестовые отправки приходят только на такие устройства
export default function AdminPushTest() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg("");
    const r = await enablePush({ scope: "all", region: "" }, "/", true);
    setBusy(false);
    setMsg(r.ok ? "Готово: это устройство получает тестовые уведомления." : r.reason === "denied" ? "Уведомления запрещены для сайта в настройках браузера." : r.reason === "unsupported" ? "Этот браузер не поддерживает уведомления (на iPhone нужно установить сайт на экран «Домой»)." : "Не удалось включить уведомления. Попробуйте позже.");
  };
  return (
    <div className="adm-inline">
      <button className="btn-plain" onClick={go} disabled={busy}>Сделать это устройство тестовым</button>
      {msg && <span className="note" role="status">{msg}</span>}
    </div>
  );
}
