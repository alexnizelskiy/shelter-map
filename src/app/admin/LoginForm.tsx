"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { login } from "./actions";
import Spinner from "@/components/Spinner";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="adm-login">
      <h1>Вход для модератора</h1>
      <div className="field-input pw">
        <input name="password" type={show ? "text" : "password"} placeholder="Пароль" autoComplete="current-password" required style={{ width: "100%", paddingRight: 44 }} />
        <button type="button" className="pw-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Скрыть пароль" : "Показать пароль"} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {state?.error && <p className="err">{state.error}</p>}
      <button className="primary" disabled={pending}>{pending && <Spinner size={18} />}{pending ? "Проверяем…" : "Войти"}</button>
    </form>
  );
}
