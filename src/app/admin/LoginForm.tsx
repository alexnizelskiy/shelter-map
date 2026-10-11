"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="adm-login">
      <h1>Вход для модератора</h1>
      <input name="password" type="password" placeholder="Пароль" autoComplete="current-password" required />
      {state?.error && <p className="err">{state.error}</p>}
      <button className="primary" disabled={pending}>{pending ? "Проверяем…" : "Войти"}</button>
    </form>
  );
}
